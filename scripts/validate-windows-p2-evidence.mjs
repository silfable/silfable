import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseP2EvidenceJson, validateP2Evidence } from "./p2-evidence.mjs";

const evidenceDirectory = resolve(process.argv[2] ?? "");
if (process.argv[2] === undefined) {
  throw new Error("Usage: npm.cmd run qa:desktop:p2:validate -- <evidence-directory> [--complete]");
}
const manifest = parseP2EvidenceJson(await readFile(resolve(evidenceDirectory, "manifest.json"), "utf8"));
const cases = parseP2EvidenceJson(await readFile(resolve(evidenceDirectory, "cases.json"), "utf8"));
const result = validateP2Evidence(manifest, cases, {
  requireComplete: process.argv.includes("--complete"),
});
console.log(`Windows P2 evidence is structurally valid: ${result.passed} passed, ${result.failed} failed, ${result.pending} pending.`);
