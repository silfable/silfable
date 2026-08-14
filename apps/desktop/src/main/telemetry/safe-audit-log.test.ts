import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  configureSafeAuditLog,
  resetSafeAuditLogForTests,
  writeSafeAuditLog,
} from "./safe-audit-log.js";

test("safe audit log writes only allowlisted structured fields", () => {
  const messages: unknown[][] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => { messages.push(args); };
  try {
    writeSafeAuditLog("reconciliation_failed", { operation: "limit_order_reconciliation", outcome: "failure", count: -1, code: "provider error", retryAt: "not-a-date" });
  } finally {
    console.info = original;
  }
  const record = JSON.parse(String(messages[0]?.[0])) as Record<string, unknown>;
  assert.equal(record.event, "reconciliation_failed");
  assert.equal(record.operation, "limit_order_reconciliation");
  assert.equal(record.outcome, "failure");
  assert.equal("count" in record, false);
  assert.equal("code" in record, false);
  assert.equal("retryAt" in record, false);
});

test("safe audit log rejects free-form event names", () => {
  assert.throws(() => writeSafeAuditLog("wallet password Mc465800."), /bounded machine-readable/u);
});

test("safe audit log persists bounded JSONL records with finite retention", { concurrency: false }, () => {
  const directory = mkdtempSync(join(tmpdir(), "silfable-audit-"));
  const original = console.info;
  console.info = () => undefined;
  try {
    configureSafeAuditLog({ directory, maxBytes: 4_096, maxArchives: 2 });
    for (let index = 0; index < 120; index += 1) {
      writeSafeAuditLog("provider_budget_blocked", {
        operation: "jupiter_request",
        outcome: "blocked",
        count: index,
        code: "RATE_BUDGET",
      });
    }
    const files = readdirSync(directory).sort();
    assert.ok(files.includes("audit.jsonl"));
    assert.ok(files.length <= 3);
    const records = files.flatMap((file) => readFileSync(join(directory, file), "utf8").trim().split("\n").filter(Boolean));
    assert.ok(records.length > 0);
    for (const record of records) {
      const parsed = JSON.parse(record) as Record<string, unknown>;
      assert.equal(parsed.event, "provider_budget_blocked");
      assert.deepEqual(Object.keys(parsed).sort(), ["code", "count", "event", "operation", "outcome", "timestamp"]);
    }
  } finally {
    resetSafeAuditLogForTests();
    console.info = original;
    rmSync(directory, { recursive: true, force: true });
  }
});
