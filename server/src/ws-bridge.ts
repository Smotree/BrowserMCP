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
        res.setHeader("Access-Control-Allow-Methods", "GET, POST");
        if (req.url === "/health") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", connected: this.isConnected() }));
        } else if (req.url === "/exec" && req.method === "POST") {
          // HTTP relay: other BrowserMCP instances can send commands through us
          let body = "";
          req.on("data", (chunk) => (body += chunk));
          req.on("end", async () => {
            try {
              const { action, params } = JSON.parse(body);
              const result = await this.sendCommand(action, params);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ result }));
            } catch (e: unknown) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: (e as Error).message }));
            }
          });
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
    // HTTP relay mode — forward to primary instance
    if (this.relayPort) {
      return this.sendViaHttp(action, params);
    }

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

  private relayPort: number | null = null;

  /**
   * Enable HTTP relay mode — forward all commands via HTTP POST to
   * an already-running BrowserMCP instance's /exec endpoint.
   */
  enableHttpRelay(port: number): void {
    this.relayPort = port;
    process.stderr.write(`[BrowserMCP] HTTP relay enabled → localhost:${port}\n`);
  }

  isConnected(): boolean {
    if (this.relayPort) return true; // relay always "connected"
    return this.client !== null && this.client.readyState === WebSocket.OPEN;
  }

  onConnectionChange(callback: (connected: boolean) => void): void {
    this.connectionCallbacks.push(callback);
  }

  private async sendViaHttp(
    action: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const resp = await fetch(`http://localhost:${this.relayPort}/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(60_000),
    });
    const data = (await resp.json()) as { result?: unknown; error?: string };
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  async close(): Promise<void> {
    this.rejectAllPending("Server shutting down");
    this.client?.close();
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss.close(() => {
          this.httpServer.close(() => resolve());
        });
      });
    }
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
