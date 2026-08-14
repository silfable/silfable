import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

type AuditOutcome = "success" | "failure" | "blocked";

type SafeAuditFields = {
  operation?: string;
  outcome?: AuditOutcome;
  count?: number;
  code?: string;
  retryAt?: string;
};

const OPERATION = /^[a-z0-9_:-]{1,80}$/u;
const CODE = /^[A-Z0-9_:-]{1,80}$/u;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_ARCHIVES = 3;

type AuditFileConfiguration = {
  directory: string;
  maxBytes: number;
  maxArchives: number;
};

let fileConfiguration: AuditFileConfiguration | null = null;

export function configureSafeAuditLog(input: {
  directory: string;
  maxBytes?: number;
  maxArchives?: number;
}): void {
  const directory = input.directory.trim();
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxArchives = input.maxArchives ?? DEFAULT_ARCHIVES;
  if (directory.length < 1 || directory.length > 1_024) throw new Error("Audit log directory is invalid.");
  if (!Number.isInteger(maxBytes) || maxBytes < 4_096 || maxBytes > 10_485_760) throw new Error("Audit log size limit is invalid.");
  if (!Number.isInteger(maxArchives) || maxArchives < 1 || maxArchives > 10) throw new Error("Audit log retention is invalid.");
  mkdirSync(directory, { recursive: true });
  fileConfiguration = { directory, maxBytes, maxArchives };
}

/** Process diagnostics with a tiny field allowlist; do not pass Error objects or user/provider payloads here. */
export function writeSafeAuditLog(event: string, fields: SafeAuditFields = {}): void {
  if (!OPERATION.test(event)) throw new Error("Audit event must use a bounded machine-readable name.");
  const payload: Record<string, string | number> = { timestamp: new Date().toISOString(), event };
  if (fields.operation !== undefined && OPERATION.test(fields.operation)) payload.operation = fields.operation;
  if (fields.outcome !== undefined) payload.outcome = fields.outcome;
  if (fields.count !== undefined && Number.isInteger(fields.count) && fields.count >= 0) payload.count = fields.count;
  if (fields.code !== undefined && CODE.test(fields.code)) payload.code = fields.code;
  if (fields.retryAt !== undefined && /^\d{4}-\d{2}-\d{2}T/u.test(fields.retryAt)) payload.retryAt = fields.retryAt;
  const encoded = JSON.stringify(payload);
  console.info(encoded);
  if (fileConfiguration !== null) {
    try {
      appendRotatingRecord(fileConfiguration, `${encoded}\n`);
    } catch {
      // Diagnostics must never break a custody, policy, or reconciliation path.
      // No error object or filesystem path is echoed because either may contain
      // user-specific information.
      console.info(JSON.stringify({
        timestamp: new Date().toISOString(),
        event: "audit_log_write_failed",
        outcome: "failure",
      }));
    }
  }
}

export function resetSafeAuditLogForTests(): void {
  fileConfiguration = null;
}

function appendRotatingRecord(configuration: AuditFileConfiguration, record: string): void {
  const active = join(configuration.directory, "audit.jsonl");
  const nextBytes = Buffer.byteLength(record);
  if (existsSync(active) && statSync(active).size + nextBytes > configuration.maxBytes) {
    const oldest = join(configuration.directory, `audit.${configuration.maxArchives}.jsonl`);
    rmSync(oldest, { force: true });
    for (let index = configuration.maxArchives - 1; index >= 1; index -= 1) {
      const source = join(configuration.directory, `audit.${index}.jsonl`);
      if (existsSync(source)) renameSync(source, join(configuration.directory, `audit.${index + 1}.jsonl`));
    }
    renameSync(active, join(configuration.directory, "audit.1.jsonl"));
  }
  appendFileSync(active, record, { encoding: "utf8", mode: 0o600 });
}
