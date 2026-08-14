import assert from "node:assert/strict";
import test from "node:test";

import { EvmWalletService } from "./evm-wallet.js";

function createSecrets() {
  let value: string | null = null;
  return {
    isLocked: () => false,
    getSecret: async () => value,
    setSecret: async (_name: "evm-wallet-secret", next: string) => { value = next; },
  };
}

test("EVM wallet creates a recovery mnemonic and persists an encrypted wallet record", async () => {
  const service = new EvmWalletService(createSecrets());
  const created = await service.createWallet();
  assert.match(created.address, /^0x[0-9a-f]{40}$/iu);
  assert.equal(created.derivationPath, "m/44'/60'/0'/0/0");
  assert.equal(await service.getAddress(), created.address);
  assert.deepEqual(await service.listWallets(), [{ address: created.address, primary: true }]);
});

test("EVM wallet supports multiple mnemonic and private-key imports while retaining the first wallet as primary", async () => {
  const service = new EvmWalletService(createSecrets());
  await assert.rejects(() => service.importMnemonic("not a mnemonic"), /invalid/u);
  const first = await service.importMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
  const second = await service.importPrivateKey(`0x${"11".repeat(32)}`);
  const wallets = await service.listWallets();
  assert.deepEqual(wallets, [
    { address: first.address, primary: true },
    { address: second.address, primary: false },
  ]);
  assert.equal(await service.getAddress(), first.address);
  await assert.rejects(() => service.importPrivateKey(`0x${"11".repeat(32)}`), /already configured/u);
  await assert.rejects(() => service.importPrivateKey("0x1234"), /private key/u);
});

test("EVM wallet exposes a signer only inside the local main-process callback", async () => {
  const service = new EvmWalletService(createSecrets());
  await service.importMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
  const address = await service.withSigner(async (signer) => signer.getAddress());
  assert.match(address, /^0x[0-9a-f]{40}$/iu);
});

test("EVM wallet resolves the signer selected by a session instead of always using the primary wallet", async () => {
  const service = new EvmWalletService(createSecrets());
  const primary = await service.importMnemonic("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about");
  const selected = await service.importPrivateKey(`0x${"22".repeat(32)}`);
  assert.equal(await service.hasAddress(primary.address), true);
  assert.equal(await service.hasAddress(selected.address.toUpperCase()), true);
  assert.equal(
    await service.withSignerForAddress(selected.address, async (signer) => signer.getAddress()),
    selected.address,
  );
  await assert.rejects(
    () => service.withSignerForAddress(`0x${"33".repeat(20)}`, async (signer) => signer.getAddress()),
    /not registered/u,
  );
});
