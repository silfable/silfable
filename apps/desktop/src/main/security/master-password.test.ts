import assert from "node:assert/strict";
import test from "node:test";

import { MasterPasswordService } from "./master-password.js";

class Settings {
  readonly values = new Map<string, unknown>();
  getSetting(key: string) { return this.values.get(key) ?? null; }
  setSetting(key: string, value: unknown) { this.values.set(key, value); }
}

test("master password is salted, verified, and never persisted as plaintext", async () => {
  const settings = new Settings();
  const service = new MasterPasswordService(settings);
  await service.configure("StrongPass1!");
  assert.equal(service.isConfigured(), true);
  assert.equal(await service.verify("StrongPass1!"), true);
  assert.equal(await service.verify("WrongPass1!"), false);
  assert.equal(JSON.stringify([...settings.values.values()]).includes("StrongPass1!"), false);
});

test("master password can be changed only with the current password", async () => {
  const service = new MasterPasswordService(new Settings());
  await service.configure("StrongPass1!");
  await assert.rejects(() => service.change("WrongPass1!", "NewStrong2!"), /incorrect/u);
  await service.change("StrongPass1!", "NewStrong2!");
  assert.equal(await service.verify("StrongPass1!"), false);
  assert.equal(await service.verify("NewStrong2!"), true);
});

test("weak master passwords fail closed", async () => {
  const service = new MasterPasswordService(new Settings());
  await assert.rejects(() => service.configure("weakpass"), /three/u);
  assert.equal(service.isConfigured(), false);
});

test("a practical nine-character mixed password is accepted", async () => {
  const service = new MasterPasswordService(new Settings());
  await service.configure("Mc465800.");
  assert.equal(await service.verify("Mc465800."), true);
});
