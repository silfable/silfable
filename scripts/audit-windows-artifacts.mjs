import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { listPackage } from "@electron/asar";

const releaseDirectory = resolve(process.argv[2] ?? "apps/desktop/release");
const unpackedOnly = process.argv.includes("--unpacked-only");
const entries = await readdir(releaseDirectory);
const installers = entries.filter((name) => /^Silfable-[0-9]+\.[0-9]+\.[0-9]+-windows-x64-setup\.exe$/u.test(name));
if (!unpackedOnly) {
  assert.equal(installers.length, 1, "Release must contain exactly one versioned Windows x64 NSIS installer");

  const installerPath = join(releaseDirectory, installers[0]);
  assert.ok((await stat(installerPath)).size > 50_000_000, "Windows installer is unexpectedly small");
  const installerHeader = await readFile(installerPath);
  assert.equal(installerHeader.subarray(0, 2).toString("ascii"), "MZ", "Windows installer is not a PE executable");
}

const unpackedDirectory = join(releaseDirectory, "win-unpacked");
const executablePath = join(unpackedDirectory, "silfable.exe");
const executableHeader = await readFile(executablePath);
assert.equal(executableHeader.subarray(0, 2).toString("ascii"), "MZ", "Packaged application is not a PE executable");

const asarPath = join(unpackedDirectory, "resources", "app.asar");
const packagedFiles = listPackage(asarPath).map((name) => name.replaceAll("\\", "/").replace(/^\/+/u, ""));
for (const required of ["out/main/index.js", "out/preload/index.cjs", "out/renderer/index.html", "package.json"]) {
  assert.ok(packagedFiles.includes(required), `Missing packaged runtime file: ${required}`);
}

const globallyForbidden = [
  /(^|[/\\])\.env(?:\.|$)/u,
  /\.(?:pem|key|pfx|p12|sqlite|sqlite3)$/u,
];
const firstPartyForbidden = [
  /\.map$/u,
  /(^|[/\\])src([/\\]|$)/u,
  /(^|[/\\])[^/\\]*\.test\.[^/\\]+$/u,
];
for (const name of packagedFiles) {
  const firstParty = !name.startsWith("node_modules/") || name.startsWith("node_modules/@silfable/");
  assert.equal(globallyForbidden.some((pattern) => pattern.test(name)), false, `Sensitive artifact entry: ${name}`);
  if (firstParty) assert.equal(firstPartyForbidden.some((pattern) => pattern.test(name)), false, `Development artifact entry: ${name}`);
}

console.log(
  unpackedOnly
    ? `Windows unpacked QA artifact audit passed: ${packagedFiles.length} ASAR entries.`
    : `Windows artifact audit passed: ${installers[0]}, ${packagedFiles.length} ASAR entries.`,
);
