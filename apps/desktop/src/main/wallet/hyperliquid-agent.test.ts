import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { HyperliquidAgentWalletService } from "./hyperliquid-agent.js";

class Secrets {
  value: string | null = null;
  locked = false;
  isLocked() { return this.locked; }
  async getSecret() { return this.value; }
  async setSecret(_name: "hyperliquid-agent-secret", value: string) { this.value = value; }
}

describe("HyperliquidAgentWalletService", () => {
  it("keeps a venue-isolated key encrypted behind the secret store", async () => {
    const secrets = new Secrets();
    const service = new HyperliquidAgentWalletService(secrets);
    const created = await service.create(
      "0x1111111111111111111111111111111111111111",
      new Date().toISOString(),
    );
    assert.match(created.privateKey, /^0x[0-9a-f]{64}$/u);
    assert.equal(
      (await service.get())?.agentAddress.toLowerCase(),
      created.agentAddress.toLowerCase(),
    );
    const signerAddress = await service.withSigner(async (signer, summary) => {
      assert.equal(summary.accountAddress, "0x1111111111111111111111111111111111111111");
      return signer.address;
    });
    assert.equal(signerAddress.toLowerCase(), created.agentAddress.toLowerCase());
  });

  it("rejects a malformed imported key", async () => {
    const service = new HyperliquidAgentWalletService(new Secrets());
    await assert.rejects(() => service.import(
      "0x1111111111111111111111111111111111111111",
      "not-a-key",
      new Date().toISOString(),
    ), /32-byte hexadecimal/u);
  });

  it("requires an unlocked vault", async () => {
    const secrets = new Secrets();
    secrets.locked = true;
    const service = new HyperliquidAgentWalletService(secrets);
    await assert.rejects(() => service.get(), /Vault is locked/u);
  });
});
