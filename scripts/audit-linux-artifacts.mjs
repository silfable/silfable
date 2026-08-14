import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { extractFile, listPackage } from "@electron/asar";

const releaseDirectory = resolve(process.argv[2] ?? "apps/desktop/release");
const entries = await readdir(releaseDirectory);
const appImages = entries.filter((name) => name.endsWith(".AppImage"));
const debs = entries.filter((name) => name.endsWith(".deb"));
assert.equal(appImages.length, 1, "QA build must contain exactly one AppImage");
assert.equal(debs.length, 1, "QA build must contain exactly one Debian package");

for (const name of [...appImages, ...debs]) {
  assert.match(name, /^Silfable-[0-9]+\.[0-9]+\.[0-9]+-[A-Za-z0-9_]+\.(?:AppImage|deb)$/u);
  assert.ok((await stat(join(releaseDirectory, name))).size > 20_000_000, `${name} is unexpectedly small`);
}

const unpackedDirectory = join(releaseDirectory, "linux-unpacked");
const executable = join(unpackedDirectory, "silfable");
const executableHeader = await readFile(executable);
assert.equal(executableHeader[0], 0x7f);
assert.equal(executableHeader.subarray(1, 4).toString("ascii"), "ELF");

const asarPath = join(unpackedDirectory, "resources", "app.asar");
const packagedFiles = listPackage(asarPath).map((name) => name.replaceAll("\\", "/").replace(/^\/+/u, ""));
for (const required of ["out/main/index.js", "out/preload/index.cjs", "out/renderer/index.html", "package.json"]) {
  assert.ok(packagedFiles.includes(required), `Missing packaged runtime file: ${required}`);
}

const globallyForbidden = [
  /(^|[/\\])\.env(?:\.|$)/u,
  /\.(?:pem|key|sqlite|sqlite3)$/u,
];
const firstPartyForbidden = [
  /\.map$/u,
  /(^|[/\\])src([/\\]|$)/u,
  /(^|[/\\])[^/\\]*\.test\.[^/\\]+$/u,
];
for (const name of packagedFiles) {
  assert.equal(
    globallyForbidden.some((pattern) => pattern.test(name)),
    false,
    `Forbidden sensitive artifact entry: ${name}`,
  );

  const isFirstParty = !name.startsWith("node_modules/") || name.startsWith("node_modules/@silfable/");
  if (isFirstParty) {
    assert.equal(
      firstPartyForbidden.some((pattern) => pattern.test(name)),
      false,
      `Forbidden first-party artifact entry: ${name}`,
    );
  }
}
assert.equal(
  packagedFiles.some((name) => name.startsWith("out/") && name.endsWith(".map")),
  false,
  "Packaged Silfable runtime must not contain source maps",
);

const packagedManifest = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
assert.equal(packagedManifest.main, "./out/main/index.js");
assert.equal(packagedManifest.private, true);
assert.equal(packagedFiles.some((name) => name.startsWith("node_modules/electron/")), false);

console.log(`Linux artifact audit passed: ${appImages[0]}, ${debs[0]}, ${packagedFiles.length} ASAR entries.`);
