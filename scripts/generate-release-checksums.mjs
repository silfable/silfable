import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const releaseDirectory = resolve(process.argv[2] ?? "apps/desktop/release");
const artifacts = (await readdir(releaseDirectory))
  .filter((name) => /\.(?:AppImage|deb|dmg|exe|msi|zip)$/u.test(name))
  .sort();
if (artifacts.length === 0) throw new Error("No release artifacts were found for checksum generation");

const lines = [];
for (const artifact of artifacts) {
  const bytes = await readFile(join(releaseDirectory, artifact));
  lines.push(`${createHash("sha256").update(bytes).digest("hex")}  ${basename(artifact)}`);
}
await writeFile(join(releaseDirectory, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, { encoding: "utf8", flag: "w" });
console.log(`Wrote SHA256SUMS.txt for ${artifacts.length} release artifact(s).`);
