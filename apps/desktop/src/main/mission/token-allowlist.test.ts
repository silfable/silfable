import { test, describe } from "node:test";
import assert from "node:assert";
import { TokenAllowlistService } from "./token-allowlist.js";

const mockDb = {
  settings: {} as Record<string, string>,
  getSetting(key: string) { return this.settings[key] ?? null; },
  setSetting(key: string, value: string) { this.settings[key] = value; }
};

const mockReads = {
  async prices(mints: string[]) {
    const map = new Map<string, any>();
    for (const mint of mints) {
      if (mint !== "FakeUnknownMint") {
        map.set(mint, { usdPrice: 100 });
      }
    }
    return map;
  }
};

describe("TokenAllowlistService", () => {
  test("returns empty array when allowlist is empty", () => {
    const service = new TokenAllowlistService(mockDb as any, mockReads as any);
    assert.deepEqual(service.getAllowlist(), []);
  });

  test("can store and retrieve allowlist", () => {
    const service = new TokenAllowlistService(mockDb as any, mockReads as any);
    service.setAllowlist(["MintA", "MintB"]);
    assert.deepEqual(service.getAllowlist(), ["MintA", "MintB"]);
  });

  test("evaluateAutonomousEligibility passes for valid allowlisted token", async () => {
    const service = new TokenAllowlistService(mockDb as any, mockReads as any);
    service.setAllowlist(["ValidMint"]);
    const result = await service.evaluateAutonomousEligibility("ValidMint");
    assert.deepEqual(result, { eligible: true });
  });

  test("evaluateAutonomousEligibility fails for token not in allowlist", async () => {
    const service = new TokenAllowlistService(mockDb as any, mockReads as any);
    service.setAllowlist(["ValidMint"]);
    const result = await service.evaluateAutonomousEligibility("OtherMint");
    assert.equal(result.eligible, false);
    if (!result.eligible) {
      assert.equal(result.reason, "Token is not in the autonomous allowlist and Autonomous Discovery is disabled.");
    }
  });

  test("evaluateAutonomousEligibility fails for token with no liquidity/price", async () => {
    const service = new TokenAllowlistService(mockDb as any, mockReads as any);
    service.setAllowlist(["FakeUnknownMint"]);
    const result = await service.evaluateAutonomousEligibility("FakeUnknownMint");
    assert.equal(result.eligible, false);
    if (!result.eligible) {
      assert.equal(result.reason, "Token price is unresolvable or lacks liquidity.");
    }
  });
});
