import { EventEmitter } from "node:events";
import type { PositionStrategyManager, ExitTriggerEvent } from "./strategy-manager.js";
import type { AutomationManager } from "./automation-manager.js";

export class DurableBackgroundObservationService extends EventEmitter {
  readonly #strategyManager: PositionStrategyManager;
  #automationManager: AutomationManager | null = null;
  #intervalTimer: NodeJS.Timeout | null = null;
  #active = false;
  #pollIntervalMs: number;

  constructor(strategyManager: PositionStrategyManager, pollIntervalMs = 2000) {
    super();
    this.#strategyManager = strategyManager;
    this.#pollIntervalMs = pollIntervalMs;

    // Listen to strategy exits
    this.#strategyManager.on("exit_triggered", (event: ExitTriggerEvent) => {
      this.emit("auto_execution_triggered", event);
    });
  }

  setAutomationManager(automationManager: AutomationManager): void {
    this.#automationManager = automationManager;
  }

  isRunning(): boolean {
    return this.#active;
  }

  startObservationLoop(fetchPricesCallback: (mints: string[]) => Promise<Map<string, number>>): void {
    if (this.#active) return;
    this.#active = true;

    this.#intervalTimer = setInterval(async () => {
      if (!this.#active) return;
      try {
        const activePositions = this.#strategyManager.getActivePositions();
        const activeAutomation = this.#automationManager?.listStrategies().filter((s) => s.status === "ACTIVE") ?? [];

        if (activePositions.length === 0 && activeAutomation.length === 0) return;

        const positionMints = activePositions.map((p) => p.mintAddress);
        const automationMints = activeAutomation.flatMap((s) => [s.inputMint, s.outputMint]);
        const uniqueMints = [...new Set([...positionMints, ...automationMints])];

        const prices = uniqueMints.length > 0 ? await fetchPricesCallback(uniqueMints) : new Map<string, number>();

        for (const [mint, price] of prices.entries()) {
          this.#strategyManager.evaluatePriceTick(mint, price);
        }

        if (this.#automationManager !== null) {
          const proposals = this.#automationManager.evaluate(new Date(), prices);
          for (const proposal of proposals) {
            this.emit("automation_proposal_created", proposal);
          }
        }
      } catch (err: any) {
        if (err?.message?.includes("locked")) return;
        // A failed RPC/price read is not a trade signal. Keep strategies active
        // but move their next evaluation forward so the UI shows a bounded
        // retry instead of an indefinitely stale "evaluating" state.
        this.#automationManager?.deferActiveEvaluations(new Date());
        if (this.listenerCount("error") > 0) {
          this.emit("error", err);
        } else {
          console.warn("[BackgroundLoop] Observation tick skipped:", err?.message || err);
        }
      }
    }, this.#pollIntervalMs);

    this.emit("statusChange", { running: true });
  }

  stopObservationLoop(): void {
    this.#active = false;
    if (this.#intervalTimer !== null) {
      clearInterval(this.#intervalTimer);
      this.#intervalTimer = null;
    }
    this.emit("statusChange", { running: false });
  }
}
