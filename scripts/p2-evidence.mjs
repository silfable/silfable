import assert from "node:assert/strict";

export const P2_CASES = Object.freeze([
  ["P2-01", "Packaged startup and vault recovery"],
  ["P2-02", "USDC to SOL reverse swap"],
  ["P2-03", "Insufficient balance"],
  ["P2-04", "Changed quote or route"],
  ["P2-05", "RPC timeout before signing"],
  ["P2-06", "Broadcast result unknown"],
  ["P2-07", "Receipt restart recovery"],
  ["P2-08", "Portfolio reconciliation"],
  ["P2-09", "Fee and account-funding evidence"],
]);

const SHA256 = /^[A-Fa-f0-9]{64}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/u;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,128}$/u;
const SAFE_ARTIFACT = /^(?![/\\])(?!.*(?:^|[/\\])\.\.(?:[/\\]|$))[A-Za-z0-9._/\\-]{1,240}$/u;
const SENSITIVE = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:seed|secret|private)[_-]?(?:key|phrase)\s*[:=]\s*\S+/iu,
  /\b(?:authorization|x-api-key)\s*[:=]\s*(?:bearer\s+)?\S+/iu,
  /\bredis:\/\/[^@\s]+@/iu,
  /[?&](?:api[_-]?key|token|secret)=[^&\s]+/iu,
  /\bsk-or-v1-[A-Za-z0-9_-]{16,}/u,
];

export function createP2Cases(buildSha256) {
  assert.match(buildSha256, SHA256, "Build SHA-256 is invalid");
  return {
    schemaVersion: 1,
    buildSha256: buildSha256.toLowerCase(),
    cases: P2_CASES.map(([id, title]) => ({
      id,
      title,
      status: "pending",
      checkedAt: null,
      publicSignatures: [],
      artifacts: [],
      notes: null,
    })),
  };
}

export function parseP2EvidenceJson(value) {
  assert.equal(typeof value, "string", "P2 evidence JSON must be text");
  return JSON.parse(value.replace(/^\uFEFF/u, ""));
}

export function validateP2Evidence(manifest, cases, options = {}) {
  assert.equal(typeof manifest, "object", "P2 manifest is missing");
  assert.equal(manifest?.schemaVersion, 2, "P2 manifest schema is unsupported");
  assert.match(manifest.startedAt, ISO_DATE, "P2 manifest timestamp is invalid");
  assert.equal(typeof manifest.executableName, "string", "Packaged executable name is missing");
  assert.equal(/[/\\]/u.test(manifest.executableName), false, "Manifest must not store a host path");
  assert.match(manifest.executableSha256, SHA256, "Packaged executable digest is invalid");
  assert.equal(typeof manifest.authenticodeStatus, "string", "Authenticode status is missing");
  assert.equal(manifest.profileMode, "isolated", "P2 must use an isolated profile");
  assert.equal(manifest.checklist, "docs/SILFABLE_PROJECT_REFERENCE.md", "P2 checklist binding is invalid");
  assert.equal(typeof cases, "object", "P2 case evidence is missing");
  assert.equal(cases?.schemaVersion, 1, "P2 case schema is unsupported");
  assert.match(cases.buildSha256, SHA256, "P2 case build digest is invalid");
  assert.equal(
    cases.buildSha256.toLowerCase(),
    manifest.executableSha256.toLowerCase(),
    "P2 cases do not match the packaged executable",
  );
  assert.ok(Array.isArray(cases.cases), "P2 cases must be an array");
  assert.equal(cases.cases.length, P2_CASES.length, "P2 case count is invalid");
  for (const [index, [expectedId, expectedTitle]] of P2_CASES.entries()) {
    const entry = cases.cases[index];
    assert.equal(entry?.id, expectedId, `Missing ${expectedId}`);
    assert.equal(entry?.title, expectedTitle, `${expectedId} title is invalid`);
    assert.ok(["pending", "pass", "fail"].includes(entry?.status), `${expectedId} status is invalid`);
    if (options.requireComplete === true) assert.equal(entry.status, "pass", `${expectedId} has not passed`);
    if (entry.status === "pending") {
      assert.equal(entry.checkedAt, null, `${expectedId} pending timestamp must be empty`);
    } else {
      assert.match(entry.checkedAt, ISO_DATE, `${expectedId} timestamp is invalid`);
    }
    assert.ok(Array.isArray(entry.publicSignatures) && entry.publicSignatures.length <= 8, `${expectedId} signatures are invalid`);
    for (const signature of entry.publicSignatures) assert.match(signature, SIGNATURE, `${expectedId} contains an invalid public signature`);
    assert.ok(Array.isArray(entry.artifacts) && entry.artifacts.length <= 12, `${expectedId} artifacts are invalid`);
    for (const artifact of entry.artifacts) assert.match(artifact, SAFE_ARTIFACT, `${expectedId} artifact path is unsafe`);
    assert.ok(entry.notes === null || (typeof entry.notes === "string" && entry.notes.length <= 500), `${expectedId} notes are invalid`);
    if (entry.notes !== null) assertNoSensitiveText(entry.notes, `${expectedId} notes`);
  }
  assertNoSensitiveText(JSON.stringify(manifest), "P2 manifest");
  return {
    total: P2_CASES.length,
    passed: cases.cases.filter((entry) => entry.status === "pass").length,
    failed: cases.cases.filter((entry) => entry.status === "fail").length,
    pending: cases.cases.filter((entry) => entry.status === "pending").length,
  };
}

function assertNoSensitiveText(value, label) {
  for (const pattern of SENSITIVE) {
    assert.equal(pattern.test(value), false, `${label} appears to contain sensitive data`);
  }
}
