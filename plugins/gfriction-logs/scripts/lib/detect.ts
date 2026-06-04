import { basename } from "node:path";
import type { Detection, FrictionType } from "./types.ts";

export interface NormalizedHookInput {
  raw: Record<string, unknown>;
  toolName: string;
  toolInput: Record<string, unknown>;
  result: Record<string, unknown>;
  sessionId: string;
  cwd: string;
  command?: string;
  exitCode?: number;
  statusText?: string;
  stdoutText: string;
  stderrText: string;
  combinedText: string;
}

export function normalizeHookInput(rawInput: unknown): NormalizedHookInput {
  const raw = asRecord(rawInput);
  const toolInput = asRecord(raw.tool_input ?? raw.toolInput ?? raw.input ?? {});
  const result = asRecord(raw.tool_output ?? raw.toolOutput ?? raw.output ?? raw.result ?? raw.tool_result ?? raw.toolResult ?? {});
  const toolName = String(raw.tool_name ?? raw.toolName ?? raw.name ?? "unknown");
  const sessionId = String(raw.session_id ?? raw.sessionId ?? raw.session?.["id"] ?? "unknown-session");
  const cwd = String(raw.cwd ?? raw.current_working_directory ?? toolInput.cwd ?? process.cwd());
  const command = stringOrUndefined(toolInput.command ?? raw.command ?? result.command);
  const exitCode = numberOrUndefined(result.exit_code ?? result.exitCode ?? result.code ?? raw.exit_code ?? raw.exitCode);
  const statusText = stringOrUndefined(result.status ?? result.state ?? raw.status ?? raw.error);
  const stderrText = collectText(result, ["stderr", "error", "errorOutput", "standardError"], true);
  const stdoutText = collectText(result, ["stdout", "output", "message", "text", "standardOutput"], false);
  const combinedText = [statusText, stderrText, stdoutText].filter(Boolean).join("\n");

  return { raw, toolName, toolInput, result, sessionId, cwd, command, exitCode, statusText, stdoutText, stderrText, combinedText };
}

export function detectFriction(input: NormalizedHookInput): Detection {
  const text = input.combinedText;
  const lower = text.toLowerCase();
  const signals: string[] = [];

  if (typeof input.exitCode === "number" && input.exitCode !== 0) signals.push("exit_code");
  if (input.statusText && /(error|failed|rejected|timeout|timed out|cancelled|canceled)/i.test(input.statusText)) signals.push("status");

  let type: FrictionType = defaultType(input.toolName, input.command);
  let severity = signals.length > 0 ? 3 : 0;
  let errorCode = typeof input.exitCode === "number" && input.exitCode !== 0 ? `nonzero-exit-${input.exitCode}` : "tool-error";

  if (/(permission denied|eacces|operation not permitted)/i.test(text)) {
    signals.push("permission_denied");
    type = "permission_blocked";
    severity = Math.max(severity, 4);
    errorCode = "permission-denied";
  } else if (/(unauthorized|forbidden|\b401\b|\b403\b|invalid credentials?)/i.test(text)) {
    signals.push("auth_failed");
    type = "auth_failed";
    severity = Math.max(severity, 4);
    errorCode = lower.includes("forbidden") || lower.includes("403") ? "forbidden" : "unauthorized";
  } else if (/(timed out|timeout|deadline exceeded|etimedout)/i.test(text)) {
    signals.push("timeout");
    type = "timeout";
    severity = Math.max(severity, 3);
    errorCode = "timeout";
  } else if (/(cannot find module|module not found|no module named|package .* not found)/i.test(text)) {
    signals.push("missing_dependency");
    type = "missing_dependency";
    severity = Math.max(severity, 3);
    errorCode = "module-not-found";
  } else if (/(no such file or directory|file not found|cannot find file|not found: .*\/)/i.test(text)) {
    signals.push("missing_file");
    type = "missing_file";
    severity = Math.max(severity, 3);
    errorCode = "file-not-found";
  } else if (/(command not found|not recognized as an internal|executable file not found)/i.test(text)) {
    signals.push("missing_dependency");
    type = "missing_dependency";
    severity = Math.max(severity, 3);
    errorCode = "command-not-found";
  } else if (/(rate limit|too many requests|\b429\b)/i.test(text)) {
    signals.push("rate_limit");
    severity = Math.max(severity, 3);
    errorCode = "rate-limit";
  } else if (/(deprecated|obsolete|no longer exported|has no exported member)/i.test(text)) {
    signals.push("stale_rule_or_api");
    type = lower.includes("rule") ? "stale_rule" : "config_mismatch";
    severity = Math.max(severity, 3);
    errorCode = "stale-or-obsolete";
  }

  const observable = signals.length > 0;
  return {
    observable,
    type: observable ? type : "unknown",
    severity,
    errorCode,
    summary: observable ? summarize(input, type, errorCode) : "No observable friction detected.",
    signals
  };
}

export function toolFamily(toolName: string, command?: string) {
  const lower = toolName.toLowerCase();
  if (lower.includes("mcp")) return "mcp";
  if (lower.includes("exec_command") || lower === "bash" || command) return "command";
  if (lower.includes("web") || lower.includes("browser")) return "external";
  if (lower.includes("apply_patch")) return "edit";
  return "tool";
}

export function normalizeCommand(command: string | undefined, toolName: string) {
  if (!command) return slugToken(toolName);
  const tokens = command.trim().split(/\s+/).slice(0, 4).map((token) => basename(token.replace(/^['"]|['"]$/g, "")));
  if (tokens[0] === "pnpm" && tokens[1] === "run" && tokens[2]) return slugToken(`pnpm-run-${tokens[2]}`);
  if (tokens[0] === "npm" && tokens[1] === "run" && tokens[2]) return slugToken(`npm-run-${tokens[2]}`);
  if ((tokens[0] === "bun" || tokens[0] === "yarn" || tokens[0] === "pnpm") && tokens[1]) return slugToken(`${tokens[0]}-${tokens[1]}`);
  return slugToken(tokens.slice(0, 2).join("-"));
}

function summarize(input: NormalizedHookInput, type: FrictionType, errorCode: string) {
  if (input.command) return `\`${input.command.split(/\s+/).slice(0, 3).join(" ")}\` failed with ${errorCode}.`;
  return `${input.toolName} failed with ${type}.`;
}

function defaultType(toolName: string, command?: string): FrictionType {
  const family = toolFamily(toolName, command);
  if (family === "command") return "command_failed";
  if (family === "mcp") return "mcp_failed";
  return "tool_failed";
}

function collectText(obj: Record<string, unknown>, preferredKeys: string[], useFallback: boolean) {
  const parts: string[] = [];
  for (const key of preferredKeys) {
    const value = obj[key];
    if (typeof value === "string") parts.push(value);
  }
  if (parts.length > 0) return parts.join("\n");
  if (!useFallback) return "";
  return collectStringValues(obj, 0).join("\n");
}

function collectStringValues(value: unknown, depth: number): string[] {
  if (depth > 3 || !value) return [];
  if (typeof value === "string") return value.length > 20 ? [value] : [];
  if (Array.isArray(value)) return value.flatMap((item) => collectStringValues(item, depth + 1)).slice(0, 10);
  if (typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([key]) => /(stderr|stdout|error|message|output|text)/i.test(key))
    .flatMap(([, nested]) => collectStringValues(nested, depth + 1))
    .slice(0, 10);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  return undefined;
}

function slugToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
