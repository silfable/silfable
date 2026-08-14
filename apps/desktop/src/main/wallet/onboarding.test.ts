import assert from "node:assert/strict";
import test from "node:test";
import { getBase58Decoder } from "@solana/kit";

import type { EncryptedWalletMetadata } from "../storage/database";
import { WalletOnboardingService } from "./onboarding";

class MemoryKeystore {
  locked = false;
  records = new Map<string, string>();

  isLocked() {
    return this.locked;
  }

  async getSecret(name: "database-data-key" | "wallet-secret") {
    return this.records.get(name) ?? null;
  }

  async setSecret(name: "wallet-secret" | "database-data-key", plaintext: string) {
    this.records.set(name, plaintext);
  }

  async deleteSecret(name: "wallet-secret") {
    this.records.delete(name);
  }
}

class MemoryDatabase {
  metadata: EncryptedWalletMetadata | null = null;

  hasWallet() {
    return this.metadata !== null;
  }

  getWallet() {
    return this.metadata;
  }

  insertWallet(metadata: EncryptedWalletMetadata) {
    this.metadata = metadata;
  }
}

test("new wallet returns a one-time mnemonic and persists only encrypted metadata", async () => {
  const keystore = new MemoryKeystore();
  const database = new MemoryDatabase();
  const result = await new WalletOnboardingService(keystore, database).createWallet();

  assert.equal(result.recoveryMnemonic.split(" ").length, 24);
  assert.equal(result.derivationPath, "m/44'/501'/0'/0'");
  assert.match(result.address, /^[1-9A-HJ-NP-Za-km-z]{32,44}$/u);
  assert.ok(keystore.records.has("wallet-secret"));
  assert.ok(keystore.records.has("database-data-key"));
  assert.ok(database.metadata);
  assert.notEqual(database.metadata.ciphertext, result.address);
  assert.equal(await new WalletOnboardingService(keystore, database).getWalletAddress(), result.address);
});

test("the same BIP44 mnemonic deterministically restores the same address", async () => {
  const mnemonic = "neither lonely flavor argue grass remind eye tag avocado spot unusual intact";
  const first = await new WalletOnboardingService(new MemoryKeystore(), new MemoryDatabase()).importMnemonic(mnemonic);
  const second = await new WalletOnboardingService(new MemoryKeystore(), new MemoryDatabase()).importMnemonic(mnemonic);
  assert.equal(first.address, second.address);
});

test("invalid mnemonic is rejected before anything is stored", async () => {
  const keystore = new MemoryKeystore();
  const database = new MemoryDatabase();
  await assert.rejects(
    new WalletOnboardingService(keystore, database).importMnemonic("not a valid mnemonic"),
    /Mnemonic is invalid/u,
  );
  assert.equal(keystore.records.size, 0);
  assert.equal(database.metadata, null);
});

test("base58 and JSON private-key imports resolve to the same address", async () => {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
  const base58 = getBase58Decoder().decode(bytes);
  const json = JSON.stringify([...bytes]);
  const fromBase58 = await new WalletOnboardingService(new MemoryKeystore(), new MemoryDatabase()).importPrivateKey(base58);
  const fromJson = await new WalletOnboardingService(new MemoryKeystore(), new MemoryDatabase()).importPrivateKey(json);
  assert.equal(fromBase58.address, fromJson.address);
});

test("multiple wallets can be added and the first wallet remains primary", async () => {
  const keystore = new MemoryKeystore();
  const database = new MemoryDatabase();
  const service = new WalletOnboardingService(keystore, database);
  const first = await service.importPrivateKey(JSON.stringify([...Uint8Array.from({ length: 32 }, (_, index) => index + 1)]));
  const second = await service.importPrivateKey(JSON.stringify([...Uint8Array.from({ length: 32 }, (_, index) => index + 33)]));
  const wallets = await service.listWallets();

  assert.deepEqual(wallets, [
    { address: first.address, primary: true },
    { address: second.address, primary: false },
  ]);
  assert.equal(await service.getWalletAddress(), first.address);
  const selected = await service.withWalletSigner(second.address, async (signer) => signer.address);
  assert.equal(selected, second.address);
  const web3Selected = await service.withWalletWeb3Keypair(second.address, async (keypair) => keypair.publicKey.toBase58());
  assert.equal(web3Selected, second.address);
  await assert.rejects(() => service.withWalletSigner("11111111111111111111111111111111", async (signer) => signer.address), /unavailable/u);
  await assert.rejects(() => service.withWalletWeb3Keypair("11111111111111111111111111111111", async (keypair) => keypair.publicKey.toBase58()), /unavailable/u);
});

test("a locked keystore blocks wallet onboarding", async () => {
  const keystore = new MemoryKeystore();
  keystore.locked = true;
  await assert.rejects(
    new WalletOnboardingService(keystore, new MemoryDatabase()).createWallet(),
    /Keystore must be unlocked/u,
  );
});
