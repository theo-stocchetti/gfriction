#!/usr/bin/env bun
import { readConfig, isDisabledByEnv } from "./lib/config.ts";
import { detectFriction, normalizeCommand, normalizeHookInput, toolFamily } from "./lib/detect.ts";
import { collectFileRefs, isExcluded, pathContext } from "./lib/paths.ts";
import { redactText, truncateUtf8 } from "./lib/redact.ts";
import { appendEvent, appendRuntime, fingerprintHash, nowIso, updateFingerprint } from "./lib/store.ts";
import type { ToolEvent } from "./lib/types.ts";

const raw = await readStdinJson();
const config = readConfig();

if (!config.enabled || isDisabledByEnv()) process.exit(0);

const normalized = normalizeHookInput(raw);
const ctx = pathContext(normalized.cwd);
const fileRefs = collectFileRefs(normalized.toolInput);

if (isExcluded(ctx, fileRefs, config)) {
  debug(config.debug, ["[gfriction-logs] skipped: excluded path or project"]);
  process.exit(config.debug ? 2 : 0);
}

const detection = detectFriction(normalized);
if (!detection.observable) process.exit(0);

const commandRedacted = redactText(normalized.command, "command");
const stderrRedacted = redactText(normalized.stderrText, "stderr");
const stdoutRedacted = redactText(normalized.stdoutText, "stdout");
const redactions = [...commandRedacted.redactions, ...stderrRedacted.redactions, ...stdoutRedacted.redactions];
const family = toolFamily(normalized.toolName, normalized.command);
const commandKey = normalizeCommand(commandRedacted.text || normalized.command, normalized.toolName);
const fingerprint = `${ctx.scope}:${ctx.rootKey}:${family}:${commandKey}:${detection.errorCode}`;
const hash = fingerprintHash(fingerprint);
const createdAt = nowIso();
const eventId = `fric_evt_${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}_${hash}`;
const summary = buildSummary(commandRedacted.text, normalized.toolName, detection.errorCode);

const event: ToolEvent = {
  schemaVersion: 1,
  eventId,
  kind: "tool_error",
  type: detection.type,
  scope: ctx.scope,
  rootPath: ctx.rootPath,
  projectPath: ctx.projectPath,
  displayProjectPath: ctx.displayProjectPath,
  cwd: ctx.cwd,
  toolName: normalized.toolName,
  toolFamily: family,
  command: commandRedacted.text || undefined,
  exitCode: normalized.exitCode,
  statusText: normalized.statusText,
  fileRefs,
  fingerprint,
  fingerprintHash: hash,
  severity: detection.severity,
  summary,
  evidence: {
    stderrExcerpt: config.evidence.includeStderr ? truncateUtf8(stderrRedacted.text, config.evidence.maxExcerptBytes) : undefined,
    stdoutExcerpt: config.evidence.includeStdout ? truncateUtf8(stdoutRedacted.text, config.evidence.maxExcerptBytes) : undefined,
    redactions
  },
  createdAt
};

const eventFile = appendEvent(event);
const update = updateFingerprint(event, eventFile, config.stop.summarizeWhen.recurrentAt);

appendRuntime(normalized.sessionId, {
  eventId,
  fingerprintHash: hash,
  isNewFingerprint: update.isNewFingerprint,
  reopened: update.reopened,
  severity: detection.severity,
  type: detection.type,
  summary,
  occurrenceCount: update.state.occurrenceCount,
  recurrentHit: update.recurrentHit,
  createdAt
});

if (config.debug) {
  const lines = [
    "[gfriction-logs] tool error logged",
    `- fingerprint: ${hash}`,
    `- type: ${detection.type}`,
    `- severity: ${detection.severity}`,
    `- eventFile: ${eventFile}`,
    "kept:",
    "- rootPath",
    "- projectPath",
    "- cwd",
    "- toolName",
    normalized.command ? "- command (redacted)" : "- command: none",
    config.evidence.includeStderr ? "- stderrExcerpt (redacted)" : "- stderrExcerpt: excluded by config",
    config.evidence.includeStdout ? "- stdoutExcerpt (redacted)" : "- stdoutExcerpt: excluded by config",
    "excluded:",
    "- transcript_path: excluded by policy"
  ];
  for (const item of redactions) lines.push(`redacted: ${item.kind}: ${item.label} -> ${item.reason}`);
  debug(true, lines);
  process.exit(2);
}

process.exit(0);

async function readStdinJson() {
  try {
    const text = await Bun.stdin.text();
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function debug(enabled: boolean, lines: string[]) {
  if (!enabled) return;
  console.log(lines.join("\n"));
}

function buildSummary(command: string | undefined, toolName: string, errorCode: string) {
  if (command) return `\`${command.split(/\s+/).slice(0, 3).join(" ")}\` failed with ${errorCode}.`;
  return `${toolName} failed with ${errorCode}.`;
}
