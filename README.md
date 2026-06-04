# Gfriction Marketplace

Codex marketplace for agent friction tooling.

## Plugins

- `gfriction-logs`: records observable tool failures with redacted evidence and provides the `gfriction-fix` skill for manual maintenance.

## GitHub Install

```sh
codex plugin marketplace add https://github.com/theo-stocchetti/gfriction --ref main
codex plugin add gfriction-logs@gfriction
```

The repository ships both marketplace layouts:

- `.agents/plugins/marketplace.json` for native Codex plugin ingestion.
- `.claude-plugin/marketplace.json` for Claude-compatible plugin ingestion.

## Local Install

```sh
codex plugin marketplace add /Users/theos/dev/tools/gfriction
codex plugin add gfriction-logs@gfriction
```

The marketplace includes:

- `.codex-plugin` metadata for native Codex plugin discovery.
- `.claude-plugin` marketplace and plugin metadata.
- `hooks.json` for native Codex lifecycle hooks.
- `hooks/hooks.json` for Claude-compatible lifecycle hooks.
- `skills/` for manual maintenance workflows.

## Layout

```txt
gfriction/
  .claude-plugin/marketplace.json
  plugins/gfriction-logs/
```
