import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PumpReceiptReconciliationService, type PumpReceiptReader } from "./receipt-reconciliation.js";

describe("Pump.fun Receipt Reconciliation (Cloud Worker)", () => {
  it("successfully reconciles a valid finalized buy transaction", async () => {
    const mockReader: PumpReceiptReader = {
      async verifyTransactionSignature() {
        return { state: "finalized", slot: 100, error: null };
      },
      async pumpTransactionSettlement() {
        return {
          slot: 100,
          walletPreLamports: "1000000000",
          walletPostLamports: "895000000", // Outflow of 105,000,000 lamports
          tokenRawDelta: "5000000",        // Received 5,000,000 tokens
          feeLamports: "5000000",          // 0.005 SOL fee
          accountCreationFundingLamports: "0",
        };
      },
    };

    const reconciler = new PumpReceiptReconciliationService(mockReader);
    const receipt = await reconciler.reconcile({
      receiptId: "receipt-123",
      signature: "sig123",
      preview: {
        id: "preview-123",
        walletAddress: "WalletA",
        tokenMint: "TokenMintB",
        side: "buy",
      },
    });

    assert.equal(receipt.status, "finalized");
    assert.equal(receipt.actualInputAmount, "100000000"); // Net input: 105m outflow - 5m fee = 100m
    assert.equal(receipt.actualOutputAmount, "5000000");
  });

  it("throws error if transaction is not finalized", async () => {
    const mockReader: PumpReceiptReader = {
      async verifyTransactionSignature() {
        return { state: "pending", slot: null, error: null };
      },
      async pumpTransactionSettlement() {
        throw new Error("Should not be called");
      },
    };

    const reconciler = new PumpReceiptReconciliationService(mockReader);
    await assert.rejects(
      async () => {
        await reconciler.reconcile({
          receiptId: "receipt-123",
          signature: "sig123",
          preview: {
            id: "preview-123",
            walletAddress: "WalletA",
            tokenMint: "TokenMintB",
            side: "buy",
          },
        });
      },
      {
        message: "Pump receipt is not finalized; reconciliation remains pending and must not update positions",
      }
    );
  });
});
