import assert from "node:assert/strict";
import test from "node:test";

import { CloudflareR2Service } from "./cloudflare-r2.js";
import { createPumpLaunchDraft } from "./launch-draft.js";

class Settings {
  value: unknown = null;
  getSetting(): unknown { return this.value; }
  setSetting(_key: string, value: unknown): void { this.value = value; }
}

class Secrets {
  values = new Map<string, string>();
  async getSecret(name: "r2-access-key-id" | "r2-secret-access-key"): Promise<string | null> { return this.values.get(name) ?? null; }
  async setSecret(name: "r2-access-key-id" | "r2-secret-access-key", value: string): Promise<void> { this.values.set(name, value); }
}

const settings = { accountId: "a".repeat(32), bucket: "silfable-launches", publicBaseUrl: "https://assets.example.com" };

test("R2 settings retain secrets in the encrypted store and use the account S3 endpoint", async () => {
  const store = new Settings();
  const secrets = new Secrets();
  let requestedUrl = "";
  let authorization = "";
  const service = new CloudflareR2Service({
    settings: store,
    secrets,
    fetch: async (input, init) => {
      requestedUrl = String(input);
      authorization = String(init?.headers && (init.headers as Record<string, string>).authorization);
      return new Response("<ListBucketResult />", { status: 200 });
    },
  });
  await service.save({ settings, accessKeyId: "access-key-id", secretAccessKey: "very-secret-access-key" });
  assert.deepEqual(store.value, settings);
  assert.equal(JSON.stringify(store.value).includes("very-secret"), false);
  await service.test();
  assert.equal(requestedUrl, `https://${settings.accountId}.r2.cloudflarestorage.com/${settings.bucket}?list-type=2&max-keys=1`);
  assert.match(authorization, /^AWS4-HMAC-SHA256 /u);
  assert.equal(authorization.includes("very-secret-access-key"), false);
});

test("R2 metadata publication is an explicit object upload and never makes a blockchain request", async () => {
  const store = new Settings();
  const secrets = new Secrets();
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const service = new CloudflareR2Service({
    settings: store,
    secrets,
    fetch: async (input, init) => {
      requests.push({ url: String(input), method: init?.method ?? "GET", body: init?.body ? new TextDecoder().decode(init.body as Uint8Array) : "" });
      return new Response("", { status: 200 });
    },
  });
  await service.save({ settings, accessKeyId: "access-key-id", secretAccessKey: "very-secret-access-key" });
  const draft = createPumpLaunchDraft({
    creatorWallet: "11111111111111111111111111111111",
    metadata: { name: "Example", symbol: "EX", description: "Local metadata", imageUri: "https://assets.example.com/example.png", metadataUri: null, websiteUrl: null, xUrl: null, telegramUrl: null },
    quoteAsset: "SOL",
    initialPurchaseAmount: "0",
    maxCreatorOutflowLamports: "1000000",
    maxPriorityFeeLamports: "0",
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    acknowledgedIrreversiblePublication: true,
  });
  const published = await service.publishLaunchMetadata(draft);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "PUT");
  assert.match(requests[0]?.url ?? "", /cloudflarestorage\.com\/silfable-launches\/silfable\/token-launch/u);
  assert.match(requests[0]?.body ?? "", /"image":"https:\/\/assets\.example\.com\/example\.png"/u);
  assert.match(published.uri, /^https:\/\/assets\.example\.com\/silfable\/token-launch\//u);
});
