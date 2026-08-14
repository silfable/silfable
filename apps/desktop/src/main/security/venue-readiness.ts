import { VenueExecutionGate, type VenueExecutionEvidence, type VenueId } from "../execution/venue-execution-gate.js";

const SETTING_KEY = "security.venue-readiness.v1";

type SettingsStore = {
  getSetting(key: string): unknown | null;
  setSetting(key: string, value: unknown): void;
};

export type VenueReadinessAttestation = {
  venue: VenueId;
  evidence: VenueExecutionEvidence;
  evidenceDigest: string;
  attestedAt: string;
  reviewer: string;
};

type ReadinessState = Partial<Record<VenueId, VenueReadinessAttestation>>;

const VENUES: readonly VenueId[] = ["bridge", "evm", "hyperliquid", "dca", "tp_sl", "full_access"];
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const REVIEWER = /^[a-z0-9._-]{3,80}$/iu;

/**
 * Main-process persistence for independent release evidence. This service is
 * intentionally not exposed via renderer IPC: an AI response, browser input,
 * or renderer flag must never mark a venue executable.
 */
export class VenueReadinessService {
  readonly #settings: SettingsStore;

  constructor(settings: SettingsStore) {
    this.#settings = settings;
  }

  get(venue: VenueId): VenueReadinessAttestation | null {
    return parseState(this.#settings.getSetting(SETTING_KEY))[venue] ?? null;
  }

  gateFor(venue: VenueId): VenueExecutionGate {
    return new VenueExecutionGate(this.get(venue)?.evidence);
  }

  record(input: VenueReadinessAttestation): VenueReadinessAttestation {
    const normalized = normalize(input);
    const state = parseState(this.#settings.getSetting(SETTING_KEY));
    state[normalized.venue] = normalized;
    this.#settings.setSetting(SETTING_KEY, state);
    return normalized;
  }

  invalidate(venue: VenueId): void {
    const state = parseState(this.#settings.getSetting(SETTING_KEY));
    delete state[venue];
    this.#settings.setSetting(SETTING_KEY, state);
  }
}

function normalize(input: VenueReadinessAttestation): VenueReadinessAttestation {
  if (!VENUES.includes(input.venue)) throw new Error("Unknown execution venue.");
  if (!DIGEST.test(input.evidenceDigest)) throw new Error("Readiness evidence must use a SHA-256 digest.");
  if (!REVIEWER.test(input.reviewer)) throw new Error("Readiness reviewer identity is invalid.");
  if (!Number.isFinite(Date.parse(input.attestedAt))) throw new Error("Readiness attestation time is invalid.");
  const evidence = {} as VenueExecutionEvidence;
  for (const key of ["signerCustody", "deterministicPolicy", "freshSimulation", "receiptReconciliation", "recoveryDrill", "securityAudit", "controlledMainnetAcceptance", "explicitFinalApproval", "revocationAndKillSwitch", "spendLimits"] as const) {
    if (typeof input.evidence[key] !== "boolean") throw new Error(`Readiness evidence '${key}' must be boolean.`);
    evidence[key] = input.evidence[key];
  }
  return { venue: input.venue, evidence, evidenceDigest: input.evidenceDigest, attestedAt: new Date(input.attestedAt).toISOString(), reviewer: input.reviewer };
}

function parseState(value: unknown): ReadinessState {
  if (typeof value !== "object" || value === null) return {};
  const candidate = value as Record<string, unknown>;
  const state: ReadinessState = {};
  for (const venue of VENUES) {
    const item = candidate[venue];
    if (typeof item !== "object" || item === null) continue;
    try { state[venue] = normalize(item as VenueReadinessAttestation); } catch { /* fail closed */ }
  }
  return state;
}
