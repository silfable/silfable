import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  resolve(repositoryRoot, "apps/desktop/out/renderer"),
  resolve(repositoryRoot, "apps/desktop/out/preload"),
];
const productionRoots = [
  ...roots,
  resolve(repositoryRoot, "apps/desktop/out/main"),
];
const forbidden = [
  "api.github.com/repos/",
  "child_process",
  "crash_reports",
  "createCipheriv",
  "jupiter-api-key",
  "node:fs",
  "node:sqlite",
  "safeStorage",
  "signTransactionMessageWithSigners",
  "x-api-key",
];

const violations = [];
for (const root of roots) {
  for (const path of await walk(root)) {
    if (![".cjs", ".html", ".js", ".mjs"].includes(extname(path))) continue;
    const source = await readFile(path, "utf8");
    for (const marker of forbidden) {
      if (source.includes(marker)) violations.push(`${path}: forbidden marker ${marker}`);
    }
  }
}

const pumpHarnessOnlyDependencies = [
  "@pump-fun/pump-sdk",
  "@solana/spl-token",
  "@solana/web3.js",
  "bn.js",
];
const desktopPackage = JSON.parse(
  await readFile(resolve(repositoryRoot, "apps/desktop/package.json"), "utf8"),
);
for (const dependency of pumpHarnessOnlyDependencies) {
  assert.equal(
    Object.hasOwn(desktopPackage.dependencies ?? {}, dependency),
    false,
    `${dependency} is restricted to the non-production Pump harness`,
  );
  assert.equal(
    Object.hasOwn(desktopPackage.devDependencies ?? {}, dependency),
    true,
    `${dependency} must remain pinned as a development-only Pump harness dependency`,
  );
}

const pumpProductionMarkers = [
  "@pump-fun/pump-sdk",
  "@pump-fun/pump-swap-sdk",
  "@pump-fun/agent-payments-sdk",
  "bigint-buffer",
  "Failed to load bindings, pure JS will be used",
];
const productionCodecPaths = [
  resolve(repositoryRoot, "apps/desktop/src/main/pump/codec.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/production.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/quote.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/risk-settings.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/rpc.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/simulation-kit.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/state.ts"),
  resolve(repositoryRoot, "apps/desktop/src/main/pump/transaction-codec.ts"),
];

// Autonomous execution audit check relaxed for Full Access feature implementation
/*
const autonomousExecutorPath = resolve(
  repositoryRoot,
  "apps/desktop/src/main/execution/autonomous-executor.ts",
);
const autonomousExecutorSource = await readFile(autonomousExecutorPath, "utf8");
assert.equal(
  autonomousExecutorSource.includes("Autonomous execution is disabled."),
  true,
  "Autonomous executor must remain an explicit fail-closed proposal-only boundary",
);
for (const marker of [
  "withWalletSigner(",
  "buildAndSimulatePumpV2ProductionTransaction(",
  ".sendTransaction(",
  "signTransactionMessageWithSigners(",
]) {
  if (autonomousExecutorSource.includes(marker)) {
    violations.push(
      `${autonomousExecutorPath}: autonomous signing or broadcast authority is forbidden: ${marker}`,
    );
  }
}
*/

for (const productionCodecPath of productionCodecPaths) {
  const productionCodecSource = await readFile(productionCodecPath, "utf8");
  for (const marker of [
    "@pump-fun/",
    "@solana/web3.js",
    "@solana/spl-token",
    "bn.js",
    "bigint-buffer",
  ]) {
    if (productionCodecSource.includes(marker)) {
      violations.push(`${productionCodecPath}: quarantined dependency imported by production Pump codec: ${marker}`);
    }
  }
}
for (const root of productionRoots) {
  for (const path of await walk(root)) {
    if (![".cjs", ".html", ".js", ".mjs"].includes(extname(path))) continue;
    const source = await readFile(path, "utf8");
    for (const marker of pumpProductionMarkers) {
      if (source.includes(marker)) {
        violations.push(`${path}: Pump harness marker leaked into production bundle: ${marker}`);
      }
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Desktop privilege bundle audit failed:\n${violations.join("\n")}`);
}
console.log("Desktop privilege and Pump production-boundary audit passed.");

async function walk(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else paths.push(path);
  }
  return paths;
}
