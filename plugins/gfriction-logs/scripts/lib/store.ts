import { appendFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { ensureDir, FRICTIONS_HOME, writeJson } from "./config.ts";
import type { FingerprintState, FrictionStatus, RuntimeRecord, ToolEvent } from "./types.ts";

export function nowIso() {
  return new Date().toISOString();
}

export function eventFileFor(date = new Date()) {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return join(FRICTIONS_HOME, "events", year, `${month}.jsonl`);
}

export function appendEvent(event: ToolEvent | Record<string, unknown>) {
  const file = eventFileFor();
  ensureDir(join(file, ".."));
  appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  return relative(FRICTIONS_HOME, file);
}

export function fingerprintHash(fingerprint: string) {
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 8);
}

export function fingerprintPath(hash: string) {
  return join(FRICTIONS_HOME, "fingerprints", `${hash}.json`);
}

export function readFingerprint(hash: string): FingerprintState | null {
  const file = fingerprintPath(hash);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as FingerprintState;
  } catch {
    return null;
  }
}

export function writeFingerprint(state: FingerprintState) {
  atomicWriteJson(fingerprintPath(state.fingerprintHash), state);
}

export function updateFingerprint(event: ToolEvent, eventFile: string, recurrentAt: number[]) {
  const existing = readFingerprint(event.fingerprintHash);
  const firstSeen = !existing;
  const reopened = Boolean(existing && existing.status === "fixed");
  const occurrenceCount = (existing?.occurrenceCount || 0) + 1;
  const status: FrictionStatus = reopened ? "open" : existing?.status || "open";
  const history = existing?.history ? [...existing.history] : [];

  history.push({
    at: event.createdAt,
    event: firstSeen ? "opened" : reopened ? "reopened" : "seen_again",
    eventId: event.eventId
  });

  const next: FingerprintState = {
    schemaVersion: 1,
    fingerprint: event.fingerprint,
    fingerprintHash: event.fingerprintHash,
    type: existing?.type || event.type,
    status,
    severity: Math.max(existing?.severity || 0, event.severity),
    scope: event.scope,
    rootPath: event.rootPath,
    projectPath: event.projectPath,
    displayProjectPath: event.displayProjectPath,
    firstSeenAt: existing?.firstSeenAt || event.createdAt,
    lastSeenAt: event.createdAt,
    occurrenceCount,
    reopenedCount: (existing?.reopenedCount || 0) + (reopened ? 1 : 0),
    reopenedAt: reopened ? event.createdAt : existing?.reopenedAt,
    summary: existing?.summary || event.summary,
    lastEvidenceRef: {
      eventFile,
      eventId: event.eventId
    },
    history,
    manualNotes: existing?.manualNotes || []
  };

  writeFingerprint(next);

  return {
    state: next,
    isNewFingerprint: firstSeen,
    reopened,
    recurrentHit: recurrentAt.includes(occurrenceCount)
  };
}

export function runtimePath(sessionId: string) {
  const safe = sessionId.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 120) || "unknown-session";
  return join(FRICTIONS_HOME, "runtime", `${safe}.jsonl`);
}

export function appendRuntime(sessionId: string, record: RuntimeRecord) {
  const file = runtimePath(sessionId);
  ensureDir(join(file, ".."));
  appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

export function readRuntime(sessionId: string): RuntimeRecord[] {
  const file = runtimePath(sessionId);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as RuntimeRecord;
      } catch {
        return null;
      }
    })
    .filter((item): item is RuntimeRecord => Boolean(item));
}

export function clearRuntime(sessionId: string) {
  const file = runtimePath(sessionId);
  if (existsSync(file)) unlinkSync(file);
}

export function atomicWriteJson(path: string, value: unknown) {
  ensureDir(join(path, ".."));
  const tmp = `${path}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}

export function updateFingerprintHistory(hash: string, entry: Record<string, unknown>) {
  const state = readFingerprint(hash);
  if (!state) return;
  state.history.push(entry);
  writeFingerprint(state);
}

export function readAllFingerprints(): FingerprintState[] {
  const dir = join(FRICTIONS_HOME, "fingerprints");
  if (!existsSync(dir)) return [];
  return Array.from(new Bun.Glob("*.json").scanSync({ cwd: dir }))
    .map((file) => readFingerprint(file.replace(/\.json$/, "")))
    .filter((item): item is FingerprintState => Boolean(item));
}
