import assert from "node:assert/strict";
import test from "node:test";

import { getManagedPinataConfig, ManagedPinataStorageService } from "./managed-pinata.js";

const config = {
  jwt: "test-pinata-jwt-token-value",
  gatewayBaseUrl: "https://gateway.pinata.cloud/ipfs",
};

test("managed Pinata configuration rejects invalid credentials and gateways", () => {
  assert.equal(getManagedPinataConfig({}), null);
  assert.throws(() => getManagedPinataConfig({ SILFABLE_PINATA_JWT: "short" }), /invalid/u);
  assert.throws(
    () => getManagedPinataConfig({ SILFABLE_PINATA_JWT: config.jwt, SILFABLE_PINATA_GATEWAY: "http://gateway.example" }),
    /HTTPS/u,
  );
});

test("managed Pinata publishes public image then metadata and never constructs a chain transaction", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const cids = ["bafybeigdyrzt5v4h4rlhbro77k6xk2qor5fdmwr7y5iy4gwlwy7um5twzi", "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"];
  const fetchPort: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Response.json({ data: { cid: cids.shift() } });
  };
  const service = new ManagedPinataStorageService(config, fetchPort);
  const result = await service.publishTokenMetadata({
    walletAddress: "ExampleWallet111111111111111111111111111111111",
    name: "System Managed Token",
    symbol: "SMT",
    description: "A metadata-only test upload.",
    websiteUrl: "https://silfable.example/token",
    xUrl: null,
    telegramUrl: null,
    imageContentType: "image/png",
    imageBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  });

  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.url === "https://uploads.pinata.cloud/v3/files" && call.init.method === "POST"), true);
  assert.equal(calls.every((call) => new Headers(call.init.headers).get("authorization") === `Bearer ${config.jwt}`), true);
  assert.match(result.imageUri, /^ipfs:\/\/bafy/u);
  assert.match(result.metadataUri, /^ipfs:\/\/bafy/u);
  assert.match(result.metadataGatewayUrl, /^https:\/\/gateway\.pinata\.cloud\/ipfs\/bafy/u);
  assert.equal(result.metadataSha256.length, 64);
});
