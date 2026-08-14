import assert from "node:assert/strict";
import test from "node:test";

import { createPumpLaunchDraft } from "./launch-draft.js";

const WALLET = "11111111111111111111111111111111";
const NOW = new Date("2026-07-28T00:00:00.000Z");
const input = {
  creatorWallet: WALLET,
  metadata: {
    name: "Example Coin",
    symbol: "EXAMPLE",
    description: "An explicit user-authored launch draft.",
    imageUri: "https://example.com/coin.png",
    metadataUri: "https://example.com/coin.json",
    websiteUrl: "https://example.com",
    xUrl: null,
    telegramUrl: null,
  },
  quoteAsset: "SOL" as const,
  initialPurchaseAmount: "0",
  maxCreatorOutflowLamports: "100000000",
  maxPriorityFeeLamports: "100000",
  deadlineAt: "2026-07-28T00:30:00.000Z",
  acknowledgedIrreversiblePublication: true as const,
};

test("Pump launch draft binds explicit immutable metadata and has no execution authority", () => {
  const draft = createPumpLaunchDraft(input, NOW);
  assert.equal(draft.creatorWallet, WALLET);
  assert.equal(draft.metadata.symbol, "EXAMPLE");
  assert.equal(draft.lifecycle, "draft-only");
  assert.equal(draft.executionAllowed, false);
});

test("Pump launch draft accepts immutable IPFS metadata while keeping the image publicly inspectable", () => {
  const draft = createPumpLaunchDraft({
    ...input,
    metadata: {
      ...input.metadata,
      metadataUri: "ipfs://bafymetadata/metadata.json",
    },
  }, NOW);
  assert.equal(draft.metadata.metadataUri, "ipfs://bafymetadata/metadata.json");
  assert.equal(draft.metadata.imageUri.startsWith("https://"), true);
});

test("Pump launch draft rejects invalid launch budget, unsafe metadata URL, and stale deadline", () => {
  assert.throws(() => createPumpLaunchDraft({ ...input, maxPriorityFeeLamports: "100000001" }, NOW), /priority fee/u);
  assert.throws(() => createPumpLaunchDraft({ ...input, initialPurchaseAmount: "100000000", maxPriorityFeeLamports: "1" }, NOW), /initial purchase/u);
  assert.throws(() => createPumpLaunchDraft({ ...input, deadlineAt: "2026-07-27T23:59:59.000Z" }, NOW), /deadline/u);
  assert.throws(() => createPumpLaunchDraft({ ...input, metadata: { ...input.metadata, imageUri: "http://example.com/coin.png" } }, NOW), /HTTPS/u);
});
