import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { BrowserCommand, BrowserResponse } from "./types.js";

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketBridge {
  private httpServer!: HttpServer;
  private wss!: WebSocketServer;
  private client: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();
  private connectionCallbacks: Array<(connected: boolean) => void> = [];
  private port: number;

  constructor(port: number = 12800) {
    this.port = port;
  }

  async start(): Promise<void> {
    await this.tryListen(this.port);
    this.setupServer();
    process.stderr.write(
      `[BrowserMCP] WebSocket server listening on port ${this.port}\n`
    );
  }

  private tryListen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET");
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", connected: this.isConnected() }));
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.wss = new WebSocketServer({ noServer: true });

      this.httpServer.on("upgrade", (req, socket, head) => {
        this.wss.handleUpgrade(req, socket, head, (ws) => {
          this.wss.emit("connection", ws, req);
        });
      });

      this.httpServer.on("error", (err) => reject(err));
      this.httpServer.listen(port, () => resolve());
    });
  }

  private setupServer(): void {
    this.wss.on("connection", (ws) => {
      // Only allow one extension client at a time
      if (this.client && this.client.readyState === WebSocket.OPEN) {
        this.client.close(1000, "New client connected");
      }

      this.client = ws;
      this.notifyConnectionChange(true);
      process.stderr.write("[BrowserMCP] Chrome extension connected\n");

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as BrowserResponse;
          const pending = this.pending.get(msg.id);
          if (!pending) return;

          clearTimeout(pending.timer);
          this.pending.delete(msg.id);

          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (this.client === ws) {
          this.client = null;
          this.notifyConnectionChange(false);
          process.stderr.write("[BrowserMCP] Chrome extension disconnected\n");
          this.rejectAllPending("Chrome extension disconnected");
        }
      });

      ws.on("error", (err) => {
        process.stderr.write(`[BrowserMCP] WebSocket error: ${err.message}\n`);
      });
    });
  }

  sendCommand(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.client || this.client.readyState !== WebSocket.OPEN) {
        reject(
          new Error(
            "Chrome extension is not connected. Please ensure the BrowserMCP extension is installed and enabled in Chrome."
          )
        );
        return;
      }

      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command '${action}' timed out after 60 seconds`));
      }, 60_000);

      this.pending.set(id, { resolve, reject, timer });

      const command: BrowserCommand = { id, action, params };
      this.client.send(JSON.stringify(command));
    });
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionCallbacks.push(callback);
  }

  async close(): Promise<void> {
    this.rejectAllPending("Server shutting down");
    this.client?.close();
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.httpServer.close(() => resolve());
      });
    });
  }

  private notifyConnectionChange(connected: boolean): void {
    for (const cb of this.connectionCallbacks) {
      cb(connected);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
