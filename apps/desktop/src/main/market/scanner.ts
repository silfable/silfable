import { EventEmitter } from "node:events";
import type { PumpWatchlistService } from "./watchlist.js";

export type ScannedTokenEvent = {
  mint: string;
  creator?: string | null;
  signature: string;
  slot: number;
  blockTime?: string | null;
  detectedAt: string;
};

export class PumpMarketScannerService extends EventEmitter {
  readonly #watchlistService: PumpWatchlistService;
  #active = false;

  constructor(watchlistService: PumpWatchlistService) {
    super();
    this.#watchlistService = watchlistService;
  }

  isScanning(): boolean {
    return this.#active;
  }

  startScanning(): void {
    this.#active = true;
    this.emit("statusChange", { scanning: true });
  }

  stopScanning(): void {
    this.#active = false;
    this.emit("statusChange", { scanning: false });
  }

  processIncomingEvent(event: Omit<ScannedTokenEvent, "detectedAt">): boolean {
    if (!this.#active) return false;

    // Filter out ignored mints
    if (this.#watchlistService.isMintIgnored(event.mint)) {
      this.emit("filtered", { reason: "mint_ignored", mint: event.mint });
      return false;
    }

    // Filter out blocked creators
    if (event.creator && this.#watchlistService.isCreatorBlocked(event.creator)) {
      this.emit("filtered", { reason: "creator_blocked", mint: event.mint, creator: event.creator });
      return false;
    }

    const payload: ScannedTokenEvent = {
      ...event,
      detectedAt: new Date().toISOString(),
    };

    this.emit("candidate", payload);
    return true;
  }
}
