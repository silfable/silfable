import assert from "node:assert/strict";
import test from "node:test";

import { createP2Cases, parseP2EvidenceJson, validateP2Evidence } from "./p2-evidence.mjs";

const digest = "a".repeat(64);
const manifest = {
  schemaVersion: 2,
  startedAt: "2026-07-28T00:00:00.000Z",
  executableName: "silfable.exe",
  executableSha256: digest,
  authenticodeStatus: "NotSigned",
  authenticodeSubject: null,
  installerName: null,
  installerSha256: null,
  profileMode: "isolated",
  checklist: "docs/SILFABLE_PROJECT_REFERENCE.md",
};

test("P2 evidence template is build-bound, ordered, and pending by default", () => {
  const cases = createP2Cases(digest);
  const result = validateP2Evidence(manifest, cases);
  assert.deepEqual(result, { total: 9, passed: 0, failed: 0, pending: 9 });
  assert.deepEqual(cases.cases.map((entry) => entry.id), [
    "P2-01", "P2-02", "P2-03", "P2-04", "P2-05", "P2-06", "P2-07", "P2-08", "P2-09",
  ]);
});

test("P2 evidence parser accepts the UTF-8 BOM emitted by Windows PowerShell", () => {
  assert.deepEqual(parseP2EvidenceJson(`\uFEFF${JSON.stringify({ schemaVersion: 1 })}`), {
    schemaVersion: 1,
  });
});

test("P2 completion gate requires every case to pass", () => {
  const cases = createP2Cases(digest);
  for (const entry of cases.cases) {
    entry.status = "pass";
    entry.checkedAt = "2026-07-28T01:00:00.000Z";
  }
  assert.deepEqual(validateP2Evidence(manifest, cases, { requireComplete: true }), {
    total: 9,
    passed: 9,
    failed: 0,
    pending: 0,
  });
  cases.cases[4].status = "fail";
  assert.throws(() => validateP2Evidence(manifest, cases, { requireComplete: true }), /P2-05 has not passed/u);
});

test("P2 evidence rejects host paths, build mismatch, and credential-shaped notes", () => {
  const cases = createP2Cases(digest);
  assert.throws(
    () => validateP2Evidence({ ...manifest, executableName: "C:\\qa\\silfable.exe" }, cases),
    /must not store a host path/u,
  );
  assert.throws(
    () => validateP2Evidence(manifest, { ...cases, buildSha256: "b".repeat(64) }),
    /do not match/u,
  );
  cases.cases[0].notes = "Authorization: Bearer should-not-be-recorded";
  assert.throws(() => validateP2Evidence(manifest, cases), /sensitive data/u);
});
