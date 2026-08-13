const SETTING_KEY = "security.emergency-stop.v1";

type SettingsStore = {
  getSetting(key: string): unknown | null;
  setSetting(key: string, value: unknown): void;
};

export type EmergencyStopStatus = {
  engaged: boolean;
  reason: string | null;
  engagedAt: string | null;
};

const DISENGAGED: EmergencyStopStatus = {
  engaged: false,
  reason: null,
  engagedAt: null,
};

export class EmergencyStopService {
  readonly #settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.#settings = settings;
  }

  get(): EmergencyStopStatus {
    return parseStatus(this.#settings.getSetting(SETTING_KEY));
  }

  engage(reason?: string | null, now = new Date()): EmergencyStopStatus {
    const current = this.get();
    if (current.engaged) return current;
    const next = {
      engaged: true,
      reason: normalizeReason(reason),
      engagedAt: now.toISOString(),
    } satisfies EmergencyStopStatus;
    this.#settings.setSetting(SETTING_KEY, next);
    return next;
  }

  release(): EmergencyStopStatus {
    this.#settings.setSetting(SETTING_KEY, DISENGAGED);
    return { ...DISENGAGED };
  }

  assertExecutionAllowed(): void {
    const status = this.get();
    if (!status.engaged) return;
    throw new Error(
      `Emergency stop is active${status.reason === null ? "" : `: ${status.reason}`}. Release it from Automation before preparing or executing a transaction.`,
    );
  }
}

function parseStatus(value: unknown): EmergencyStopStatus {
  if (typeof value !== "object" || value === null) return { ...DISENGAGED };
  const record = value as Record<string, unknown>;
  if (record.engaged !== true) return { ...DISENGAGED };
  if (
    (record.reason !== null && typeof record.reason !== "string")
    || typeof record.engagedAt !== "string"
    || !Number.isFinite(Date.parse(record.engagedAt))
  ) {
    return {
      engaged: true,
      reason: "Emergency-stop state requires review",
      engagedAt: "1970-01-01T00:00:00.000Z",
    };
  }
  return {
    engaged: true,
    reason: record.reason === null ? null : normalizeReason(record.reason),
    engagedAt: record.engagedAt,
  };
}

function normalizeReason(reason: string | null | undefined): string | null {
  const normalized = (reason ?? "").trim().replace(/\s+/gu, " ");
  return normalized.length === 0 ? null : normalized.slice(0, 200);
}
