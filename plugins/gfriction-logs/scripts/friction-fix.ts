#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRICTIONS_HOME } from "./lib/config.ts";
import { pathContext, slugForRoot } from "./lib/paths.ts";
import { atomicWriteJson, readAllFingerprints, readFingerprint } from "./lib/store.ts";
import type { FingerprintState, FrictionStatus, FrictionType } from "./lib/types.ts";

const args = Bun.argv.slice(2);
const command = args[0] || "audit";

switch (command) {
  case "audit":
    audit(args.slice(1));
    break;
  case "show":
    show(requiredArg(args[1], "hash"));
    break;
  case "close":
    close(requiredArg(args[1], "hash"), args.slice(2));
    break;
  case "reclassify":
    reclassify(requiredArg(args[1], "hash"), args.slice(2));
    break;
  default:
    usage();
    process.exit(1);
}

function audit(flags: string[]) {
  const scope = parseScope(flags);
  const all = readAllFingerprints();
  const selected = all.filter((item) => {
    if (scope.kind === "global") return item.scope === "global";
    return item.rootPath === scope.rootPath;
  });

  const active = selected.filter((item) => !["fixed", "wontfix", "obsolete", "duplicate"].includes(item.status));
  const sorted = [...active].sort((a, b) => b.severity - a.severity || b.occurrenceCount - a.occurrenceCount);
  const reportPath = reportPathFor(scope);
  const report = renderReport(scope, selected, sorted);
  mkdirSync(join(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, report, "utf8");

  console.log(`Report written: ${reportPath}`);
  console.log(`Open: ${active.filter((item) => item.status === "open").length}`);
  console.log(`Needs human: ${active.filter((item) => item.status === "needs_human").length}`);
  console.log(`Severity >= 4: ${active.filter((item) => item.severity >= 4).length}`);
}

function show(hash: string) {
  const state = readFingerprint(hash);
  if (!state) throw new Error(`Unknown fingerprint: ${hash}`);
  console.log(JSON.stringify(state, null, 2));
}

function close(hash: string, flags: string[]) {
  const status = valueAfter(flags, "--status") as FrictionStatus | undefined;
  if (!status || !["open", "needs_human", "fixed", "wontfix", "obsolete", "duplicate"].includes(status)) {
    throw new Error("Use --status open|needs_human|fixed|wontfix|obsolete|duplicate");
  }
  const state = mustFingerprint(hash);
  state.status = status;
  state.history.push({ at: new Date().toISOString(), event: "manual_status_change", status });
  atomicWriteJson(join(FRICTIONS_HOME, "fingerprints", `${hash}.json`), state);
  console.log(`Updated ${hash}: status=${status}`);
}

function reclassify(hash: string, flags: string[]) {
  const state = mustFingerprint(hash);
  const type = valueAfter(flags, "--type") as FrictionType | undefined;
  const severityRaw = valueAfter(flags, "--severity");
  if (type) state.type = type;
  if (severityRaw) {
    const severity = Number(severityRaw);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) throw new Error("--severity must be 1..5");
    state.severity = severity;
  }
  state.history.push({ at: new Date().toISOString(), event: "manual_reclassify", type, severity: severityRaw ? Number(severityRaw) : undefined });
  atomicWriteJson(join(FRICTIONS_HOME, "fingerprints", `${hash}.json`), state);
  console.log(`Reclassified ${hash}`);
}

function renderReport(scope: ReturnType<typeof parseScope>, selected: FingerprintState[], sorted: FingerprintState[]) {
  const title = scope.kind === "global" ? "global" : slugForRoot(scope.rootPath);
  const now = new Date().toISOString().slice(0, 10);
  const open = selected.filter((item) => item.status === "open").length;
  const needsHuman = selected.filter((item) => item.status === "needs_human").length;
  const fixedReopened = selected.filter((item) => item.reopenedCount > 0 && item.status === "open").length;
  const severe = selected.filter((item) => item.severity >= 4 && !["fixed", "wontfix", "obsolete", "duplicate"].includes(item.status)).length;

  const lines = [
    `# Friction Audit - ${title} - ${now}`,
    "",
    "## Summary",
    "",
    "| Metric | Count |",
    "|---|---:|",
    `| Open | ${open} |`,
    `| Needs human | ${needsHuman} |`,
    `| Fixed reopened | ${fixedReopened} |`,
    `| Severity >= 4 | ${severe} |`,
    "",
    "## Top Frictions",
    ""
  ];

  for (const item of sorted.slice(0, 20)) {
    lines.push(
      `### ${item.fingerprintHash} - ${item.type} - severity ${item.severity}`,
      "",
      `- Status: ${item.status}`,
      `- Occurrences: ${item.occurrenceCount}`,
      `- Root: ${item.rootPath}`,
      `- Project: ${item.displayProjectPath}`,
      `- Last seen: ${item.lastSeenAt}`,
      `- Summary: ${item.summary}`,
      `- Suggested next action: run \`gfriction-fix show ${item.fingerprintHash}\`, then decide whether to plan, apply, close, or reclassify.`,
      ""
    );
  }

  lines.push("## Recommended Fix Order", "");
  sorted.slice(0, 10).forEach((item, index) => {
    lines.push(`${index + 1}. \`${item.fingerprintHash}\` - severity ${item.severity} - ${item.type}`);
  });
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function parseScope(flags: string[]) {
  if (flags.includes("--global")) return { kind: "global" as const, rootPath: "" };
  const root = valueAfter(flags, "--root");
  if (root) return { kind: "project" as const, rootPath: root };
  const ctx = pathContext(process.cwd());
  return { kind: ctx.scope === "global" ? "global" as const : "project" as const, rootPath: ctx.rootPath };
}

function reportPathFor(scope: ReturnType<typeof parseScope>) {
  const today = new Date().toISOString().slice(0, 10);
  if (scope.kind === "global") return join(FRICTIONS_HOME, "reports", "global", `${today}.md`);
  return join(FRICTIONS_HOME, "reports", "projects", slugForRoot(scope.rootPath), `${today}.md`);
}

function requiredArg(value: string | undefined, name: string) {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function mustFingerprint(hash: string) {
  const state = readFingerprint(hash);
  if (!state) throw new Error(`Unknown fingerprint: ${hash}`);
  return state;
}

function valueAfter(flags: string[], name: string) {
  const index = flags.indexOf(name);
  return index >= 0 ? flags[index + 1] : undefined;
}

function usage() {
  console.log(`Usage:
  bun scripts/friction-fix.ts audit [--global|--root /path]
  bun scripts/friction-fix.ts show <hash>
  bun scripts/friction-fix.ts close <hash> --status fixed
  bun scripts/friction-fix.ts reclassify <hash> [--type command_failed] [--severity 4]`);
}
