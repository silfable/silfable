import {
  PumpExecutionReceiptSchema,
  type PumpExecutionReceipt,
  type PumpTradeContractPreview,
} from "@silfable/contracts";

import type {
  PumpTransactionSettlement,
  SignatureVerification,
} from "../integrations/read-only.js";

type PumpReceiptReader = {
  verifyTransactionSignature(signature: string): Promise<SignatureVerification>;
  pumpTransactionSettlement(signature: string, walletAddress: string, tokenMint: string): Promise<PumpTransactionSettlement>;
};

export class PumpReceiptReconciliationService {
  readonly #reader: PumpReceiptReader;

  constructor(reader: PumpReceiptReader) {
    this.#reader = reader;
  }

  async reconcile(input: {
    receiptId: string;
    preview: PumpTradeContractPreview;
    signature: string;
    now?: Date;
  }): Promise<PumpExecutionReceipt> {
    const verification = await this.#reader.verifyTransactionSignature(input.signature);
    if (verification.state !== "finalized" || verification.slot === null || verification.error !== null) {
      throw new Error("Pump receipt is not finalized; reconciliation remains pending and must not update positions");
    }
    const settlement = await this.#reader.pumpTransactionSettlement(
      input.signature,
      input.preview.walletAddress,
      input.preview.tokenMint,
    );
    if (settlement.slot !== verification.slot) {
      throw new Error("Pump receipt verification and settlement slots do not match");
    }
    const walletDelta = BigInt(settlement.walletPostLamports) - BigInt(settlement.walletPreLamports);
    const tokenDelta = BigInt(settlement.tokenRawDelta);
    const networkFee = BigInt(settlement.feeLamports);
    const accountFunding = BigInt(settlement.accountCreationFundingLamports);
    let actualInput: bigint;
    let actualOutput: bigint;
    if (input.preview.side === "buy") {
      const walletOutflow = -walletDelta;
      actualInput = walletOutflow - networkFee - accountFunding;
      actualOutput = tokenDelta;
      if (walletDelta >= 0n || tokenDelta <= 0n || actualInput <= 0n) {
        throw new Error("Finalized Pump buy settlement does not prove positive SOL input and token output");
      }
    } else {
      actualInput = -tokenDelta;
      actualOutput = walletDelta + networkFee;
      if (walletDelta <= 0n || tokenDelta >= 0n || actualInput <= 0n || actualOutput <= 0n) {
        throw new Error("Finalized Pump sell settlement does not prove positive token input and SOL output");
      }
    }
    return PumpExecutionReceiptSchema.parse({
      id: input.receiptId,
      previewId: input.preview.id,
      signature: input.signature,
      walletAddress: input.preview.walletAddress,
      tokenMint: input.preview.tokenMint,
      side: input.preview.side,
      status: "finalized",
      slot: settlement.slot,
      networkFeeLamports: settlement.feeLamports,
      accountCreationFundingLamports: settlement.accountCreationFundingLamports,
      walletLamportDelta: walletDelta.toString(),
      tokenRawDelta: tokenDelta.toString(),
      actualInputAmount: actualInput.toString(),
      actualOutputAmount: actualOutput.toString(),
      chainVerification: "finalized",
      signingSource: "future-local-signer",
      broadcastAttempted: true,
      reconciledAt: (input.now ?? new Date()).toISOString(),
    });
  }

  async reconcileUnknownBroadcast(input: {
    receiptId: string;
    preview: PumpTradeContractPreview;
    signature: string;
    now?: Date;
  }): Promise<{ status: "finalized"; receipt: PumpExecutionReceipt } | { status: "pending" | "failed"; error: string | null }> {
    const verification = await this.#reader.verifyTransactionSignature(input.signature);
    if (verification.state === "failed" || verification.error !== null) {
      return { status: "failed", error: verification.error ?? "Transaction execution failed on chain" };
    }
    if (verification.state !== "finalized" || verification.slot === null) {
      return { status: "pending", error: null };
    }
    const receipt = await this.reconcile(input);
    return { status: "finalized", receipt };
  }
}

