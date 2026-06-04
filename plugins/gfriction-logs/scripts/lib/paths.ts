import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { CODEX_HOME } from "./config.ts";
import type { GfrictionConfig, PathContext } from "./types.ts";

export function pathContext(rawCwd?: string): PathContext {
  const cwd = resolve(rawCwd || process.cwd());

  if (isInside(cwd, CODEX_HOME)) {
    return makeContext("global", CODEX_HOME, cwd);
  }

  const root = findRoot(cwd);
  if (root) return makeContext("project", root, cwd);

  return makeContext("unknown", cwd, cwd);
}

export function isExcluded(ctx: PathContext, fileRefs: Array<string | { path: null }>, config: GfrictionConfig): boolean {
  const checks = [ctx.cwd, ctx.rootPath];
  for (const ref of fileRefs) {
    if (typeof ref === "string") checks.push(ref);
  }

  return [...config.excludePaths, ...config.excludeProjects].some((excluded) => {
    const absolute = resolve(expandHome(excluded));
    return checks.some((candidate) => isInside(candidate, absolute) || candidate === absolute);
  });
}

export function collectFileRefs(input: unknown): Array<string | { label: string; path: null; reason: string }> {
  const refs = new Set<string>();
  collectPaths(input, refs);
  return [...refs].slice(0, 20).map((path) => {
    if (isSensitivePath(path)) {
      return { label: basename(path), path: null, reason: "sensitive_file_path" };
    }
    return path;
  });
}

export function slugForRoot(rootPath: string) {
  const base = slugify(basename(rootPath) || "root");
  const hash = createHash("sha256").update(rootPath).digest("hex").slice(0, 6);
  return `${base}-${hash}`;
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "item";
}

export function isInside(candidate: string, parent: string) {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function makeContext(scope: PathContext["scope"], rootPath: string, cwd: string): PathContext {
  const projectPath = relative(rootPath, cwd) || ".";
  const displayProjectPath = projectPath === "." ? "." : `.${sep}${projectPath}`;
  return {
    scope,
    rootPath,
    projectPath,
    displayProjectPath,
    cwd,
    rootKey: slugForRoot(rootPath)
  };
}

function findRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, "AGENTS.md"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function collectPaths(value: unknown, refs: Set<string>) {
  if (!value || refs.size >= 20) return;
  if (Array.isArray(value)) {
    for (const item of value) collectPaths(item, refs);
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (typeof nested === "string" && /(^|_)(file|path|file_path|notebook_path)$/.test(key)) {
      const expanded = expandHome(nested);
      refs.add(isAbsolute(expanded) ? resolve(expanded) : expanded);
      continue;
    }
    if (typeof nested === "object") collectPaths(nested, refs);
  }
}

function isSensitivePath(path: string) {
  const name = basename(path).toLowerCase();
  return name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key") || name === "id_rsa" || name === "auth.json";
}

function expandHome(path: string) {
  return path.startsWith("~/") ? join(process.env.HOME || "", path.slice(2)) : path;
}
