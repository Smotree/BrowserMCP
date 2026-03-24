export const MAX_CONTENT_LENGTH = 100_000;

export function truncate(text: string, max: number = MAX_CONTENT_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + `\n\n[Content truncated at ${max} characters]`;
}

export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function jsonResult(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text: truncate(text) }] };
}
