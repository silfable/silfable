import { EventEmitter } from "node:events";
import type { RuntimeDatabase } from "../storage/database.js";

export type PositionConfig = {
  id: string;
  mintAddress: string;
  entryPrice: number;
  amount: string;
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  trailingStopPercent?: number | null;
  highestPriceSeen?: number;
};

export type ExitTriggerEvent = {
  positionId: string;
  mintAddress: string;
  reason: "STOP_LOSS" | "TAKE_PROFIT" | "TRAILING_STOP";
  triggerPrice: number;
  targetPrice: number;
  amount: string;
  triggeredAt: string;
};

export class PositionStrategyManager extends EventEmitter {
  readonly #db: RuntimeDatabase;

  constructor(db: RuntimeDatabase) {
    super();
    this.#db = db;
  }

  registerPosition(config: PositionConfig): void {
    const highestPrice = config.highestPriceSeen ?? config.entryPrice;
    this.#db.upsertActivePosition({
      ...config,
      highestPriceSeen: highestPrice,
    });
  }

  closePosition(positionId: string): void {
    this.#databaseRemove(positionId);
  }

  getActivePositions() {
    return this.#db.listActivePositions();
  }

  #databaseRemove(id: string) {
    this.#db.removeActivePosition(id);
  }

  evaluatePriceTick(mintAddress: string, currentPrice: number): ExitTriggerEvent[] {
    const positions = this.#db.listActivePositions().filter((p) => p.mintAddress === mintAddress);
    const triggeredExits: ExitTriggerEvent[] = [];

    for (const position of positions) {
      let updatedHighest = position.highestPriceSeen;
      let effectiveStopLoss = position.stopLossPrice;

      // Trailing Stop adjustment
      if (position.trailingStopPercent !== null && position.trailingStopPercent > 0) {
        if (currentPrice > updatedHighest) {
          updatedHighest = currentPrice;
        }
        const trailingStopPrice = updatedHighest * (1 - position.trailingStopPercent / 100);
        if (effectiveStopLoss === null || trailingStopPrice > effectiveStopLoss) {
          effectiveStopLoss = trailingStopPrice;
        }

        // Persist updated highest price & effective stop loss
        this.#db.upsertActivePosition({
          id: position.id,
          mintAddress: position.mintAddress,
          entryPrice: position.entryPrice,
          amount: position.amount,
          stopLossPrice: effectiveStopLoss,
          takeProfitPrice: position.takeProfitPrice,
          trailingStopPercent: position.trailingStopPercent,
          highestPriceSeen: updatedHighest,
        });
      }

      // Check Stop-Loss / Trailing Stop Trigger
      if (effectiveStopLoss !== null && currentPrice <= effectiveStopLoss) {
        const reason = position.trailingStopPercent !== null ? "TRAILING_STOP" : "STOP_LOSS";
        const trigger: ExitTriggerEvent = {
          positionId: position.id,
          mintAddress: position.mintAddress,
          reason,
          triggerPrice: currentPrice,
          targetPrice: effectiveStopLoss,
          amount: position.amount,
          triggeredAt: new Date().toISOString(),
        };
        triggeredExits.push(trigger);
        this.emit("exit_triggered", trigger);
        continue;
      }

      // Check Take-Profit Trigger
      if (position.takeProfitPrice !== null && currentPrice >= position.takeProfitPrice) {
        const trigger: ExitTriggerEvent = {
          positionId: position.id,
          mintAddress: position.mintAddress,
          reason: "TAKE_PROFIT",
          triggerPrice: currentPrice,
          targetPrice: position.takeProfitPrice,
          amount: position.amount,
          triggeredAt: new Date().toISOString(),
        };
        triggeredExits.push(trigger);
        this.emit("exit_triggered", trigger);
      }
    }

    return triggeredExits;
  }
}
