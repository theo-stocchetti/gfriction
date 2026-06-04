import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { GfrictionConfig } from "./types.ts";

export const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
export const FRICTIONS_HOME = join(CODEX_HOME, "frictions");
export const CONFIG_PATH = join(FRICTIONS_HOME, "config.json");

export const DEFAULT_CONFIG: GfrictionConfig = {
  enabled: true,
  debug: true,
  captureWarnings: false,
  retentionDays: 180,
  evidence: {
    maxExcerptBytes: 4096,
    includeStdout: false,
    includeStderr: true,
    includeTranscript: false
  },
  stop: {
    enabled: true,
    summarizeWhen: {
      new: true,
      minSeverity: 4,
      recurrentAt: [3, 5, 10],
      sameTurnRepeat: true
    }
  },
  excludePaths: [],
  excludeProjects: []
};

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function readConfig(): GfrictionConfig {
  ensureDir(FRICTIONS_HOME);
  if (!existsSync(CONFIG_PATH)) {
    writeJson(CONFIG_PATH, DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }

  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    return mergeConfig(DEFAULT_CONFIG, parsed);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeJson(path: string, value: unknown) {
  ensureDir(dirname(path));
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function mergeConfig(base: GfrictionConfig, override: Partial<GfrictionConfig>): GfrictionConfig {
  return {
    ...base,
    ...override,
    evidence: {
      ...base.evidence,
      ...(override.evidence || {})
    },
    stop: {
      ...base.stop,
      ...(override.stop || {}),
      summarizeWhen: {
        ...base.stop.summarizeWhen,
        ...(override.stop?.summarizeWhen || {})
      }
    },
    excludePaths: override.excludePaths || base.excludePaths,
    excludeProjects: override.excludeProjects || base.excludeProjects
  };
}

export function isDisabledByEnv() {
  return process.env.GFRICTION_DISABLED === "1" || process.env.GFRICTION_DISABLED === "true";
}
