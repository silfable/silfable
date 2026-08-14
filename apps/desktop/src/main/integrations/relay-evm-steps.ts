import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

/**
 * The subset of Relay execution steps that a local EVM bridge executor may
 * consume.  Relay can also return signature/API steps; those are deliberately
 * rejected here until they receive a separately audited implementation.
 */
export type RelayEvmTransactionStep = Readonly<{
  id: string;
  kind: "approval" | "bridge";
  chainId: number;
  to: Address;
  data: Hex;
  valueWei: bigint;
}>;

type UnknownRecord = Record<string, unknown>;

/**
 * Extracts chain-bound EVM transactions from a Relay quote response without
 * trusting display labels or arbitrary payload data. It never signs, sends,
 * approves, or calls a provider.
 */
export function parseRelayEvmTransactionSteps(input: {
  steps: unknown;
  expectedChainId: number;
  maximumSteps?: number;
}): readonly RelayEvmTransactionStep[] {
  if (!Number.isSafeInteger(input.expectedChainId) || input.expectedChainId <= 0) {
    throw new Error("Relay EVM route has an invalid expected chain ID");
  }
  const maximumSteps = input.maximumSteps ?? 3;
  if (!Number.isInteger(maximumSteps) || maximumSteps < 1 || maximumSteps > 8) {
    throw new Error("Relay EVM route step limit is invalid");
  }
  if (!Array.isArray(input.steps)) throw new Error("Relay quote is missing execution steps");

  const transactions: RelayEvmTransactionStep[] = [];
  for (const [stepIndex, rawStep] of input.steps.entries()) {
    const step = asRecord(rawStep, `Relay step ${stepIndex + 1}`);
    const stepKind = typeof step.kind === "string" ? step.kind.toLowerCase() : "";
    if (stepKind === "signature") {
      throw new Error("Relay route requires a signature step that is not enabled for unattended EVM bridging");
    }
    const items = Array.isArray(step.items) ? step.items : [];
    for (const [itemIndex, rawItem] of items.entries()) {
      const item = asRecord(rawItem, `Relay step ${stepIndex + 1} item ${itemIndex + 1}`);
      if (typeof item.kind === "string" && item.kind.toLowerCase() === "signature") {
        throw new Error("Relay route requires a signature step that is not enabled for unattended EVM bridging");
      }
      // Relay V2 currently places `kind: transaction` on the parent step
      // while its transaction items only expose `data`. Earlier versions put
      // the kind on each item. Accept both documented response shapes.
      const itemKind = typeof item.kind === "string" ? item.kind.toLowerCase() : "";
      if (itemKind !== "transaction" && stepKind !== "transaction") continue;
      const data = asRecord(item.data, `Relay transaction ${stepIndex + 1}.${itemIndex + 1}`);
      const chainId = parseChainId(data.chainId ?? step.chainId);
      if (chainId !== input.expectedChainId) {
        throw new Error(`Relay transaction chain mismatch: expected ${input.expectedChainId}, received ${chainId}`);
      }
      const to = parseAddress(data.to);
      const calldata = parseCalldata(data.data);
      const valueWei = parseWei(data.value ?? "0");
      const label = [item.label, step.action, step.description, step.id, step.kind].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
      transactions.push({
        id: `relay-${stepIndex + 1}-${itemIndex + 1}`,
        kind: /approv|allowance/u.test(label) ? "approval" : "bridge",
        chainId,
        to,
        data: calldata,
        valueWei,
      });
    }
  }
  if (transactions.length === 0) throw new Error("Relay quote contains no EVM transaction steps");
  if (transactions.length > maximumSteps) throw new Error("Relay quote contains too many EVM transaction steps for the release-controlled route");
  if (transactions.filter((transaction) => transaction.kind === "bridge").length !== 1) {
    throw new Error("Relay route must contain exactly one EVM bridge transaction");
  }
  return transactions;
}

function asRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as UnknownRecord;
}

function parseChainId(value: unknown): number {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/u.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Relay transaction has an invalid chain ID");
  return parsed;
}

function parseAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error("Relay transaction has an invalid recipient");
  return getAddress(value);
}

function parseCalldata(value: unknown): Hex {
  if (typeof value !== "string" || !isHex(value)) throw new Error("Relay transaction has invalid calldata");
  return value;
}

function parseWei(value: unknown): bigint {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error("Relay transaction has an invalid value");
  }
  const normalized = String(value);
  if (!/^\d+$/u.test(normalized)) throw new Error("Relay transaction value must be an unsigned integer");
  return BigInt(normalized);
}
