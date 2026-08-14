export type SignatureVerification = {
  state: "finalized" | "failed" | "pending";
  slot: number | null;
  error: string | null;
};

export type PumpTransactionSettlement = {
  slot: number;
  walletPreLamports: string;
  walletPostLamports: string;
  tokenRawDelta: string;
  feeLamports: string;
  accountCreationFundingLamports: string;
};

export type PumpReceiptReader = {
  verifyTransactionSignature(signature: string): Promise<SignatureVerification>;
  pumpTransactionSettlement(signature: string, walletAddress: string, tokenMint: string): Promise<PumpTransactionSettlement>;
};

export type PumpTradePreview = {
  id: string;
  walletAddress: string;
  tokenMint: string;
  side: "buy" | "sell";
};

export class PumpReceiptReconciliationService {
  readonly #reader: PumpReceiptReader;

  constructor(reader: PumpReceiptReader) {
    this.#reader = reader;
  }

  async reconcile(input: {
    receiptId: string;
    preview: PumpTradePreview;
    signature: string;
  }) {
    const verification = await this.#reader.verifyTransactionSignature(input.signature);
    if (verification.state !== "finalized" || verification.slot === null || verification.error !== null) {
      throw new Error("Pump receipt is not finalized; reconciliation remains pending and must not update positions");
    }
    const settlement = await this.#reader.pumpTransactionSettlement(
      input.signature,
      input.preview.walletAddress,
      input.preview.tokenMint
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

    return {
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
    };
  }
}
