import { TransactionSettingsSchema, type SessionSafetyOverrides, type TransactionSettings } from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

const SETTINGS_KEY = "mainnet-transaction-settings-v1";

export const DEFAULT_TRANSACTION_SETTINGS: TransactionSettings = Object.freeze({
  maxNetworkFeeLamports: 200_000,
  maxFeePercent: 5,
  defaultSlippageBps: 50,
  maxSlippageBps: 300,
  defaultDeadlineMinutes: 30,
  priority: "standard",
});

export class TransactionSettingsService {
  readonly #database: RuntimeDatabase;

  constructor(database: RuntimeDatabase) {
    this.#database = database;
  }

  get(): TransactionSettings {
    const stored = this.#database.getSetting(SETTINGS_KEY);
    const parsed = TransactionSettingsSchema.safeParse(stored);
    return parsed.success ? parsed.data : { ...DEFAULT_TRANSACTION_SETTINGS };
  }

  save(input: TransactionSettings): TransactionSettings {
    const settings = TransactionSettingsSchema.parse(input);
    this.#database.setSetting(SETTINGS_KEY, settings);
    return settings;
  }
}

/**
 * Session overrides are intentionally a one-way safety ratchet. A stale or
 * tampered session can never widen the current device-level slippage ceiling.
 */
export function withSessionSafetyOverrides(settings: TransactionSettings, overrides: SessionSafetyOverrides | undefined): TransactionSettings {
  if (overrides === undefined) return settings;
  const maxSlippageBps = Math.min(settings.maxSlippageBps, overrides.maxSlippageBps);
  return {
    ...settings,
    maxSlippageBps,
    defaultSlippageBps: Math.min(settings.defaultSlippageBps, maxSlippageBps),
  };
}
