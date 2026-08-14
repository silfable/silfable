import {
  PumpRiskEvidenceSchema,
  PumpRiskSettingsSchema,
  type PumpRiskEvidence,
  type PumpRiskSettings,
  type PumpRiskUsage,
} from "@silfable/contracts";

import type { RuntimeDatabase } from "../storage/database.js";

const SETTINGS_KEY = "pump-risk-settings-v1";

export const DEFAULT_PUMP_RISK_SETTINGS: PumpRiskSettings = Object.freeze({
  maxTradingFeeBps: 500,
  maxSlippageBps: 300,
  maxSpendPerTradeLamports: "50000000",
  maxDailySpendLamports: "200000000",
  maxPerTokenExposureLamports: "100000000",
  maxTotalExposureLamports: "500000000",
  maxOpenPositions: 5,
  maxTransactionsPerHour: 10,
  minSolReserveLamports: "20000000",
});

export class PumpRiskSettingsService {
  readonly #database: RuntimeDatabase;

  constructor(database: RuntimeDatabase) {
    this.#database = database;
  }

  get(): PumpRiskSettings {
    const parsed = PumpRiskSettingsSchema.safeParse(this.#database.getSetting(SETTINGS_KEY));
    return parsed.success ? parsed.data : { ...DEFAULT_PUMP_RISK_SETTINGS };
  }

  save(input: PumpRiskSettings): PumpRiskSettings {
    const settings = PumpRiskSettingsSchema.parse(input);
    this.#database.setSetting(SETTINGS_KEY, settings);
    return settings;
  }
}

type PumpRiskInput = {
  side: "buy" | "sell";
  inputAmount: string;
  maxSlippageBps: number;
  walletSolLamports: string;
  maxNetworkFeeLamports: number;
  settings: PumpRiskSettings;
  usage?: PumpRiskUsage;
};

export function evaluatePumpProposalRisk(input: PumpRiskInput, now = new Date()): PumpRiskEvidence {
  const settings = PumpRiskSettingsSchema.parse(input.settings);
  const usage = input.usage ?? { dailySpendLamports: "0", perTokenExposureLamports: "0", totalExposureLamports: "0", openPositions: 0, transactionsThisHour: 0 };
  const spend = input.side === "buy" ? positive(input.inputAmount, "buy spend") : 0n;
  const walletBalance = unsigned(input.walletSolLamports, "wallet SOL balance");
  const dailySpend = unsigned(usage.dailySpendLamports, "daily spend");
  const perTokenExposure = unsigned(usage.perTokenExposureLamports, "per-token exposure");
  const totalExposure = unsigned(usage.totalExposureLamports, "total exposure");
  const projectedOpenPositions = usage.openPositions + (spend > 0n && perTokenExposure === 0n ? 1 : 0);
  const projectedWalletBalance = walletBalance - spend - BigInt(input.maxNetworkFeeLamports);
  const checks: PumpRiskEvidence["checks"] = [
    check("slippage", input.maxSlippageBps <= settings.maxSlippageBps, "Pump proposal slippage exceeds the global Pump limit"),
    check("per-trade-spend", spend <= BigInt(settings.maxSpendPerTradeLamports), "Pump proposal exceeds the global per-trade spend limit"),
    check("daily-spend", dailySpend + spend <= BigInt(settings.maxDailySpendLamports), "Pump proposal exceeds the global daily spend limit"),
    check("per-token-exposure", perTokenExposure + spend <= BigInt(settings.maxPerTokenExposureLamports), "Pump proposal exceeds the global per-token exposure limit"),
    check("total-exposure", totalExposure + spend <= BigInt(settings.maxTotalExposureLamports), "Pump proposal exceeds the global total exposure limit"),
    check("open-positions", projectedOpenPositions <= settings.maxOpenPositions, "Pump proposal exceeds the global open-position limit"),
    check("hourly-transactions", usage.transactionsThisHour + 1 <= settings.maxTransactionsPerHour, "Pump proposal exceeds the global hourly transaction limit"),
    check("sol-reserve", projectedWalletBalance >= BigInt(settings.minSolReserveLamports), "Pump proposal would reduce SOL below the global reserve floor"),
  ];
  return PumpRiskEvidenceSchema.parse({
    side: input.side,
    proposedSpendLamports: spend.toString(),
    walletBalanceLamports: walletBalance.toString(),
    maxNetworkFeeLamports: input.maxNetworkFeeLamports,
    projectedWalletBalanceLamports: projectedWalletBalance.toString(),
    reserveFloorLamports: settings.minSolReserveLamports,
    usageSource: input.usage === undefined ? "no-execution-baseline" : "persisted-receipts",
    usage,
    limits: settings,
    checks,
    passed: checks.every((entry) => entry.passed),
    evaluatedAt: now.toISOString(),
  });
}

export function assertPumpProposalWithinRisk(input: PumpRiskInput): PumpRiskEvidence {
  const evidence = evaluatePumpProposalRisk(input);
  const blocked = evidence.checks.find((entry) => !entry.passed);
  if (blocked) throw new Error(blocked.message);
  return evidence;
}

function check(id: PumpRiskEvidence["checks"][number]["id"], passed: boolean, failure: string): PumpRiskEvidence["checks"][number] {
  return { id, passed, message: passed ? `${riskLabel(id)} is within the configured global limit.` : failure };
}

function riskLabel(id: PumpRiskEvidence["checks"][number]["id"]): string {
  return ({
    slippage: "Slippage",
    "per-trade-spend": "Per-trade spend",
    "daily-spend": "Daily spend",
    "per-token-exposure": "Per-token exposure",
    "total-exposure": "Total exposure",
    "open-positions": "Open positions",
    "hourly-transactions": "Hourly transaction count",
    "sol-reserve": "SOL reserve",
  } as const)[id];
}

function positive(value: string, label: string): bigint {
  const parsed = unsigned(value, label);
  if (parsed < 1n) throw new Error(`Pump ${label} is invalid`);
  return parsed;
}

function unsigned(value: string, label: string): bigint {
  if (!/^\d+$/u.test(value)) throw new Error(`Pump ${label} is invalid`);
  return BigInt(value);
}
