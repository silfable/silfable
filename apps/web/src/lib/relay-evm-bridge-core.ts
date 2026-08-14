import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export const ROBINHOOD_CHAIN_ID = 4_663;
export const RELAY_SOLANA_CHAIN_ID = 792_703_809;
export const ROBINHOOD_USDG_ADDRESS = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export type RelayEvmTransaction = {
  kind: "approval" | "deposit";
  from: Address;
  to: Address;
  data: Hex;
  value: Hex;
  chainId: number;
};

export type ParsedRelayEvmQuote = {
  action: "approval" | "deposit";
  transaction: RelayEvmTransaction;
  requestId: string;
  estimatedAmountOut: string;
  minimumAmountOut: string;
  totalFeeUsd: number;
  estimatedSeconds: number;
};

type UnknownRecord = Record<string, unknown>;

export function parseRelayEvmQuote(input: {
  payload: unknown;
  walletAddress: string;
  amountIn: string;
  maximumTotalFeeUsd: number;
}): ParsedRelayEvmQuote {
  const wallet = getAddress(input.walletAddress);
  const payload = asRecord(input.payload, "Relay quote");
  if (!/^\d+$/u.test(input.amountIn) || BigInt(input.amountIn) <= BigInt(0)) throw new Error("Bridge input amount is invalid.");
  const transactions = parseTransactions(payload.steps, wallet);
  const approval = transactions.find((transaction) => transaction.kind === "approval");
  const deposit = transactions.find((transaction) => transaction.kind === "deposit");
  if (!deposit) throw new Error("Relay quote is missing the bridge deposit transaction.");
  if (approval) validateExactApproval(approval, deposit.to, BigInt(input.amountIn));
  const estimatedAmountOut = readUnsigned(payload, [["details", "currencyOut", "amount"], ["details", "destination", "outputCurrency", "amount"]], "destination amount");
  const minimumAmountOut = readUnsignedOptional(payload, [["details", "currencyOut", "minimumAmount"], ["details", "destination", "outputCurrency", "minimumAmount"]]) ?? estimatedAmountOut;
  const totalFeeUsd = readTotalFeeUsd(payload);
  if (totalFeeUsd > input.maximumTotalFeeUsd) throw new Error(`Relay fee $${totalFeeUsd.toFixed(4)} exceeds the web bridge limit of $${input.maximumTotalFeeUsd.toFixed(2)}.`);
  return {
    action: approval ? "approval" : "deposit",
    transaction: approval ?? deposit,
    requestId: findRequestId(payload.steps),
    estimatedAmountOut,
    minimumAmountOut,
    totalFeeUsd,
    estimatedSeconds: readTimeEstimate(payload),
  };
}

function parseTransactions(rawSteps: unknown, wallet: Address): RelayEvmTransaction[] {
  if (!Array.isArray(rawSteps)) throw new Error("Relay quote is missing execution steps.");
  const transactions: RelayEvmTransaction[] = [];
  for (const [stepIndex, rawStep] of rawSteps.entries()) {
    const step = asRecord(rawStep, `Relay step ${stepIndex + 1}`);
    const items = Array.isArray(step.items) ? step.items : [];
    for (const [itemIndex, rawItem] of items.entries()) {
      const item = asRecord(rawItem, `Relay step ${stepIndex + 1} item ${itemIndex + 1}`);
      const itemKind = typeof item.kind === "string" ? item.kind.toLowerCase() : typeof step.kind === "string" ? step.kind.toLowerCase() : "";
      if (itemKind === "signature") throw new Error("Relay returned a signature step that is not enabled for this bridge.");
      if (itemKind !== "transaction") continue;
      const data = asRecord(item.data, `Relay transaction ${stepIndex + 1}.${itemIndex + 1}`);
      const chainId = Number(data.chainId ?? step.chainId);
      if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error("Relay transaction is not pinned to Robinhood Chain.");
      const from = parseAddress(data.from);
      if (from.toLowerCase() !== wallet.toLowerCase()) throw new Error("Relay transaction sender does not match the bound wallet.");
      const to = parseAddress(data.to);
      if (typeof data.data !== "string" || !isHex(data.data)) throw new Error("Relay transaction calldata is invalid.");
      const valueWei = parseUnsigned(data.value ?? "0", "transaction value");
      const label = [item.label, step.action, step.id, step.kind].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
      transactions.push({
        kind: /approv|allowance/u.test(label) ? "approval" : "deposit",
        from,
        to,
        data: data.data,
        value: `0x${BigInt(valueWei).toString(16)}`,
        chainId,
      });
    }
  }
  if (transactions.length === 0 || transactions.length > 3) throw new Error("Relay returned an unsupported EVM transaction sequence.");
  if (transactions.filter((transaction) => transaction.kind === "deposit").length !== 1) throw new Error("Relay route must contain exactly one bridge deposit transaction.");
  return transactions;
}

function validateExactApproval(transaction: RelayEvmTransaction, expectedSpender: Address, maximumAmount: bigint): void {
  if (transaction.to.toLowerCase() !== ROBINHOOD_USDG_ADDRESS || !/^0x095ea7b3[0-9a-fA-F]{128}$/u.test(transaction.data)) {
    throw new Error("Relay approval is not an exact USDG approve transaction.");
  }
  const spender = getAddress(`0x${transaction.data.slice(34, 74)}`);
  const amount = BigInt(`0x${transaction.data.slice(74, 138)}`);
  if (spender.toLowerCase() !== expectedSpender.toLowerCase()) throw new Error("Relay approval spender does not match the bridge deposit target.");
  if (amount <= BigInt(0) || amount > maximumAmount) throw new Error("Relay approval amount exceeds the exact bridge amount.");
}

function asRecord(value: unknown, label: string): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as UnknownRecord;
}

function parseAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error("Relay transaction contains an invalid address.");
  return getAddress(value);
}

function parseUnsigned(value: unknown, label: string): string {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/u.test(String(value))) throw new Error(`Relay ${label} is invalid.`);
  return String(value);
}

function getPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const segment of path) current = asRecord(current, "Relay quote field")[segment];
  return current;
}

function readUnsigned(value: unknown, paths: readonly (readonly string[])[], label: string): string {
  const found = readUnsignedOptional(value, paths);
  if (found === null) throw new Error(`Relay quote is missing ${label}.`);
  return found;
}

function readUnsignedOptional(value: unknown, paths: readonly (readonly string[])[]): string | null {
  for (const path of paths) {
    try {
      const found = getPath(value, path);
      if ((typeof found === "string" || typeof found === "number") && /^\d+$/u.test(String(found))) return String(found);
    } catch { /* try the next response shape */ }
  }
  return null;
}

function findRequestId(steps: unknown): string {
  if (!Array.isArray(steps)) throw new Error("Relay quote is missing steps.");
  for (const raw of steps) {
    const step = asRecord(raw, "Relay step");
    if (typeof step.requestId === "string" && /^0x[a-fA-F0-9]{64}$/u.test(step.requestId)) return step.requestId;
    if (!Array.isArray(step.items)) continue;
    for (const rawItem of step.items) {
      const item = asRecord(rawItem, "Relay step item");
      const check = item.check && typeof item.check === "object" ? item.check as UnknownRecord : null;
      const match = typeof check?.endpoint === "string" ? check.endpoint.match(/[?&]requestId=(0x[a-fA-F0-9]{64})/u) : null;
      if (match?.[1]) return match[1];
    }
  }
  throw new Error("Relay quote is missing a trackable request ID.");
}

function readTotalFeeUsd(payload: UnknownRecord): number {
  try {
    const impact = Number(getPath(payload, ["details", "totalImpact", "usd"]));
    if (Number.isFinite(impact) && impact >= 0) return impact;
  } catch { /* use fee components */ }
  const fees = asRecord(payload.fees, "Relay fees");
  let total = 0;
  let found = false;
  for (const key of ["gas", "relayer", "app", "currencyGasTopup"] as const) {
    const value = fees[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const fee = value as UnknownRecord;
    const raw = fee.amountUsd ?? fee.usd;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) { total += parsed; found = true; }
  }
  if (!found) throw new Error("Relay quote is missing a verifiable USD fee breakdown.");
  return total;
}

function readTimeEstimate(payload: UnknownRecord): number {
  try {
    const value = Number(getPath(payload, ["details", "timeEstimate"]));
    return Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 86_400) : 0;
  } catch { return 0; }
}
