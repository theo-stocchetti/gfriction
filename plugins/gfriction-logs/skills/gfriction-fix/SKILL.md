---
name: gfriction-fix
description: Manually audit, inspect, reclassify, close, and report Codex friction logs captured by the gfriction-logs plugin. Use when the user asks to fix, clean, audit, review, summarize, or maintain friction logs.
---

# Gfriction Fix

Use this skill to work with `gfriction-logs` data in a human-in-the-loop way.

## Data Model

- `events/*.jsonl` are append-only raw events.
- `fingerprints/*.json` are living state and may be updated.
- `reports/*.md` are durable human reports.
- `runtime/*.jsonl` are temporary hook buffers.

Do not read full Codex transcripts by default. Do not inject frictions into future prompts automatically.

## Commands

Resolve the plugin root from this skill path:

```sh
PLUGIN_ROOT="$(cd "$(dirname "$SKILL_FILE")/../.." && pwd)"
```

In practice, run the script by absolute path from the installed plugin directory.

```sh
bun <plugin-root>/scripts/friction-fix.ts audit
bun <plugin-root>/scripts/friction-fix.ts audit --global
bun <plugin-root>/scripts/friction-fix.ts audit --root /path/to/project
bun <plugin-root>/scripts/friction-fix.ts show <hash>
bun <plugin-root>/scripts/friction-fix.ts close <hash> --status fixed
bun <plugin-root>/scripts/friction-fix.ts reclassify <hash> --severity 4
```

## Workflow

1. If the user gives no scope, audit the current project.
2. Use `show <hash>` before proposing a targeted fix.
3. For config, skill, rule, or docs edits, inspect the referenced files first.
4. Apply changes only when the user explicitly asks.
5. Close or reclassify fingerprints only when the user asks or the evidence is clear.

## Statuses

- `open`
- `needs_human`
- `fixed`
- `wontfix`
- `obsolete`
- `duplicate`

## Output

Report:

- the report path when one is generated
- top frictions by severity and recurrence
- any manual status changes
- any files edited
