#!/usr/bin/env bun
import { readConfig, isDisabledByEnv } from "./lib/config.ts";
import { normalizeHookInput } from "./lib/detect.ts";
import { pathContext } from "./lib/paths.ts";
import { appendEvent, clearRuntime, nowIso, readRuntime, updateFingerprintHistory } from "./lib/store.ts";

const raw = await readStdinJson();
const config = readConfig();

if (!config.enabled || !config.stop.enabled || isDisabledByEnv()) process.exit(0);

const normalized = normalizeHookInput(raw);
if (raw && typeof raw === "object" && (raw as Record<string, unknown>).stop_hook_active === true) process.exit(0);

const records = readRuntime(normalized.sessionId);
if (records.length === 0) process.exit(0);

const ctx = pathContext(normalized.cwd);
const grouped = new Map<string, typeof records>();
for (const record of records) {
  grouped.set(record.fingerprintHash, [...(grouped.get(record.fingerprintHash) || []), record]);
}

const triggers = new Set<string>();
if (config.stop.summarizeWhen.new && records.some((record) => record.isNewFingerprint)) triggers.add("new");
if (records.some((record) => record.severity >= config.stop.summarizeWhen.minSeverity)) triggers.add("significant");
if (records.some((record) => record.recurrentHit)) triggers.add("recurrent");
if (config.stop.summarizeWhen.sameTurnRepeat && [...grouped.values()].some((items) => items.length > 1)) triggers.add("same_turn_repeat");

if (triggers.size === 0) {
  clearRuntime(normalized.sessionId);
  process.exit(0);
}

const createdAt = nowIso();
const fingerprintHashes = [...grouped.keys()];
const eventId = `fric_sum_${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
const summary = buildSummary(records);

const event = {
  schemaVersion: 1,
  eventId,
  kind: "turn_summary",
  scope: ctx.scope,
  rootPath: ctx.rootPath,
  projectPath: ctx.projectPath,
  displayProjectPath: ctx.displayProjectPath,
  cwd: ctx.cwd,
  fingerprintHashes,
  summary,
  triggers: [...triggers],
  createdAt
};

appendEvent(event);
for (const hash of fingerprintHashes) {
  updateFingerprintHistory(hash, {
    at: createdAt,
    event: "turn_summary",
    summaryEventId: eventId,
    triggers: [...triggers]
  });
}

clearRuntime(normalized.sessionId);

if (config.debug) {
  console.log([
    "[gfriction-logs] turn summary written",
    `- fingerprints: ${fingerprintHashes.length}`,
    `- errors: ${records.length}`,
    `- triggers: ${[...triggers].join(", ")}`,
    "- transcript_path: excluded by policy"
  ].join("\n"));
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

function buildSummary(records: typeof import("./lib/types.ts").RuntimeRecord[]) {
  const byType = new Map<string, number>();
  for (const record of records) byType.set(record.type, (byType.get(record.type) || 0) + 1);
  const parts = [...byType.entries()].map(([type, count]) => `${count} ${type}`);
  return `${records.length} tool error(s) observed this turn: ${parts.join(", ")}.`;
}
