# Gfriction Marketplace

Codex marketplace for agent friction tooling.

## Plugins

- `gfriction-logs`: records observable tool failures with redacted evidence and provides the `gfriction-fix` skill for manual maintenance.

## GitHub Install

```sh
codex plugin marketplace add https://github.com/theo-stocchetti/gfriction --ref main
codex plugin add gfriction-logs@gfriction
```

## Local Install

```sh
codex plugin marketplace add /Users/theos/dev/tools/gfriction
codex plugin add gfriction-logs@gfriction
```

The marketplace includes:

- `.claude-plugin` marketplace and plugin metadata.
- `hooks/hooks.json` for lifecycle hooks.
- `skills/` for manual maintenance workflows.

## Layout

```txt
gfriction/
  .claude-plugin/marketplace.json
  plugins/gfriction-logs/
```
