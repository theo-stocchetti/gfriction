import type { Redaction } from "./types.ts";

const SECRET_KEY_RE = /\b([A-Z_][A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD|PASS|PWD|AUTH|CREDENTIAL|DATABASE_URL|DB_URL)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g;
const AUTH_HEADER_RE = /(Authorization\s*:\s*)(Bearer\s+)?([A-Za-z0-9._~+/\-=]{12,})/gi;
const CURL_AUTH_HEADER_RE = /(-H\s+["']Authorization:\s*)(Bearer\s+)?([^"']+)(["'])/gi;
const BASIC_AUTH_URL_RE = /\b([a-z][a-z0-9+.-]*:\/\/)([^:\s/@]+):([^@\s]+)@/gi;
const COMMON_TOKEN_RE = /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g;

export function redactText(input: string | undefined, source: string): { text: string; redactions: Redaction[] } {
  if (!input) return { text: "", redactions: [] };

  const redactions: Redaction[] = [];
  let text = input;

  text = text.replace(SECRET_KEY_RE, (_match, key: string) => {
    redactions.push({ kind: source, label: key, reason: "secret_value" });
    return `${key}=<redacted>`;
  });

  text = text.replace(CURL_AUTH_HEADER_RE, (_match, prefix: string, bearer: string | undefined, _value: string, quote: string) => {
    redactions.push({ kind: source, label: "Authorization", reason: "credential" });
    return `${prefix}${bearer || ""}<redacted>${quote}`;
  });

  text = text.replace(AUTH_HEADER_RE, (_match, prefix: string, bearer: string | undefined) => {
    redactions.push({ kind: source, label: "Authorization", reason: "credential" });
    return `${prefix}${bearer || ""}<redacted>`;
  });

  text = text.replace(BASIC_AUTH_URL_RE, (_match, scheme: string, user: string) => {
    redactions.push({ kind: source, label: `${scheme.replace("://", "")}-password`, reason: "connection_string_secret" });
    return `${scheme}${user}:<redacted>@`;
  });

  text = text.replace(COMMON_TOKEN_RE, (token: string) => {
    const label = token.startsWith("sk-") ? "api-token" : token.slice(0, 4);
    redactions.push({ kind: source, label, reason: "token" });
    return "<redacted-token>";
  });

  return { text, redactions };
}

export function truncateUtf8(input: string, maxBytes: number): string {
  const bytes = Buffer.from(input, "utf8");
  if (bytes.byteLength <= maxBytes) return input;
  return `${bytes.subarray(0, maxBytes).toString("utf8").replace(/\uFFFD$/u, "")}\n...[truncated]`;
}
