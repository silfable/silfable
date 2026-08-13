import assert from "node:assert/strict";
import test from "node:test";
import { createKeyPairSignerFromPrivateKeyBytes } from "@solana/kit";

import { ManagedLaunchMetadataClient } from "./managed-metadata.js";

test("authenticates the local wallet and publishes metadata without exposing storage credentials", async () => {
  const signer = await createKeyPairSignerFromPrivateKeyBytes(
    Uint8Array.from({ length: 32 }, (_, index) => index + 1),
  );
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchMock = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = input.toString();
    calls.push({ url, init });
    if (url.endsWith("/api/auth/wallet/challenge")) {
      return Response.json({
        challengeId: "507f1f77bcf86cd799439011",
        walletAddress: signer.address,
        message: "Authenticate managed metadata upload. This does not authorize a transaction.",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
    }
    if (url.endsWith("/api/auth/wallet/verify")) {
      return new Response(JSON.stringify({
        authenticated: true,
        walletAddress: signer.address,
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "silfable_wallet_session=test-session; Path=/; HttpOnly; Secure",
        },
      });
    }
    assert.equal((init?.headers as Record<string, string>).cookie, "silfable_wallet_session=test-session");
    assert.ok(init?.body instanceof FormData);
    return Response.json({
      published: true,
      imageCid: "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3dyntlv4j5q4z4xq6zq7test",
      metadataCid: "bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxxtest",
      imageUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3dyntlv4j5q4z4xq6zq7test",
      metadataUri: "ipfs://bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxxtest",
      imageGatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3dyntlv4j5q4z4xq6zq7test",
      metadataGatewayUrl: "https://gateway.pinata.cloud/ipfs/bafybeihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxxtest",
      metadataSha256: "a".repeat(64),
      executionAllowed: false,
      message: "Metadata is published for review. No transaction was created.",
    }, { status: 201 });
  };
  const client = new ManagedLaunchMetadataClient({
    wallets: {
      withWalletSigner: async (_address, operation) => operation(signer),
    },
    baseUrl: "https://silfable.example",
    fetch: fetchMock as typeof fetch,
  });

  const result = await client.publish({
    schemaVersion: 1,
    requestId: "00000000-0000-4000-8000-000000000001",
    creatorWallet: signer.address,
    name: "Silfable Test",
    symbol: "SFT",
    description: "Managed metadata test.",
    websiteUrl: null,
    xUrl: null,
    telegramUrl: null,
    imageBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
    imageContentType: "image/png",
  });

  assert.equal(result.published, true);
  assert.match(result.metadataUri, /^ipfs:\/\//u);
  assert.deepEqual(
    calls.map(({ url }) => new URL(url).pathname),
    ["/api/auth/wallet/challenge", "/api/auth/wallet/verify", "/api/token-launch/metadata"],
  );
  assert.equal(JSON.stringify(calls).includes("PINATA"), false);
});
