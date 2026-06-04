# Gfriction Logs

`gfriction-logs` is a local-first Codex plugin for recording agent frictions.

It has two parts:

- `gfriction-logs`: hooks that record observable tool failures.
- `gfriction-fix`: a skill for manual audit, reporting, reclassification, and cleanup.

## Principles

- Human-in-the-loop by default.
- No automatic context injection.
- No raw transcript reading.
- Events are append-only.
- Fingerprints are editable state.
- Reports are durable Markdown artifacts.
- Secrets are redacted before persistence.

## Storage

```txt
~/.codex/frictions/
  config.json
  events/
    2026/
      06.jsonl
  fingerprints/
    <hash>.json
  reports/
    global/
    projects/
  runtime/
```

## Install

From GitHub:

```sh
codex plugin marketplace add https://github.com/theo-stocchetti/gfriction --ref main
codex plugin add gfriction-logs@gfriction
```

Or from the local marketplace root:

```sh
codex plugin marketplace add /Users/theos/dev/tools/gfriction
codex plugin add gfriction-logs@gfriction
```

Start a new Codex thread after installation so hooks and skills are picked up.

## Hook Smoke Test

In a new Codex thread, run a deliberately missing command:

```sh
__gfriction_hook_smoke__
```

Then check:

```sh
find ~/.codex/frictions -maxdepth 5 -type f
tail -20 ~/.codex/frictions/events/$(date -u +%Y)/$(date -u +%m).jsonl
```

If hooks are active, the failed command creates an event and a fingerprint.
