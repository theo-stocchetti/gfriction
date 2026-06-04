export type FrictionStatus =
  | "open"
  | "needs_human"
  | "fixed"
  | "wontfix"
  | "obsolete"
  | "duplicate";

export type FrictionType =
  | "command_failed"
  | "permission_blocked"
  | "missing_dependency"
  | "missing_file"
  | "stale_rule"
  | "tool_failed"
  | "mcp_failed"
  | "skill_failed"
  | "timeout"
  | "auth_failed"
  | "config_mismatch"
  | "unknown";

export interface GfrictionConfig {
  enabled: boolean;
  debug: boolean;
  captureWarnings: boolean;
  retentionDays: number;
  evidence: {
    maxExcerptBytes: number;
    includeStdout: boolean;
    includeStderr: boolean;
    includeTranscript: boolean;
  };
  stop: {
    enabled: boolean;
    summarizeWhen: {
      new: boolean;
      minSeverity: number;
      recurrentAt: number[];
      sameTurnRepeat: boolean;
    };
  };
  excludePaths: string[];
  excludeProjects: string[];
}

export interface Redaction {
  kind: string;
  label: string;
  reason: string;
}

export interface PathContext {
  scope: "global" | "project" | "unknown";
  rootPath: string;
  projectPath: string;
  displayProjectPath: string;
  cwd: string;
  rootKey: string;
}

export interface Detection {
  observable: boolean;
  type: FrictionType;
  severity: number;
  errorCode: string;
  summary: string;
  signals: string[];
}

export interface ToolEvent {
  schemaVersion: 1;
  eventId: string;
  kind: "tool_error";
  type: FrictionType;
  scope: PathContext["scope"];
  rootPath: string;
  projectPath: string;
  displayProjectPath: string;
  cwd: string;
  toolName: string;
  toolFamily: string;
  command?: string;
  exitCode?: number;
  statusText?: string;
  fileRefs: Array<string | { label: string; path: null; reason: string }>;
  fingerprint: string;
  fingerprintHash: string;
  severity: number;
  summary: string;
  evidence: {
    stderrExcerpt?: string;
    stdoutExcerpt?: string;
    redactions: Redaction[];
  };
  createdAt: string;
}

export interface RuntimeRecord {
  eventId: string;
  fingerprintHash: string;
  isNewFingerprint: boolean;
  reopened: boolean;
  severity: number;
  type: FrictionType;
  summary: string;
  occurrenceCount: number;
  recurrentHit: boolean;
  createdAt: string;
}

export interface FingerprintState {
  schemaVersion: 1;
  fingerprint: string;
  fingerprintHash: string;
  type: FrictionType;
  status: FrictionStatus;
  severity: number;
  scope: PathContext["scope"];
  rootPath: string;
  projectPath: string;
  displayProjectPath: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  reopenedCount: number;
  reopenedAt?: string;
  summary: string;
  lastEvidenceRef: {
    eventFile: string;
    eventId: string;
  };
  history: Array<Record<string, unknown>>;
  manualNotes: Array<Record<string, unknown>>;
}
