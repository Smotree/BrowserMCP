export interface BrowserCommand {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface BrowserResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export interface PageContent {
  title: string;
  url: string;
  text: string;
  html?: string;
  meta?: Record<string, string>;
}

export interface TabInfo {
  id: number;
  url: string;
  title: string;
  active: boolean;
  windowId: number;
}
