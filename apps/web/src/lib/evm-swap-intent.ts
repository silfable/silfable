export type RobinhoodSwapIntent = { requested: boolean; amount: string | null; sellToken: string | null; buyToken: string | null; needsContractAddress: boolean };

const SWAP_WORD = /\b(?:swap|tukar|convert|jual|beli)\b/iu;
const TOKEN = "(0x[0-9a-fA-F]{40}|[A-Za-z][A-Za-z0-9_-]{1,31})";
const PAIR = new RegExp(`${TOKEN}\\s*(?:ke|to|->|→)\\s*${TOKEN}`, "iu");
const AMOUNT_PAIR = new RegExp(`(?:\\$\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(?:dari|of)?\\s*${TOKEN}\\s*(?:ke|to|->|→)\\s*${TOKEN}`, "iu");
const KNOWN = /^(?:ETH|USDG|USD)$/iu;
const ADDRESS = /^0x[0-9a-f]{40}$/iu;

function normalize(value: string): string { return /^USD$/iu.test(value) ? "USDG" : KNOWN.test(value) ? value.toUpperCase() : value; }

export function resolveRobinhoodSwapIntent(message: string): RobinhoodSwapIntent {
  if (!SWAP_WORD.test(message)) return { requested: false, amount: null, sellToken: null, buyToken: null, needsContractAddress: false };
  const amountPair = message.match(AMOUNT_PAIR);
  const pair = amountPair ?? message.match(PAIR);
  if (!pair) return { requested: true, amount: null, sellToken: null, buyToken: null, needsContractAddress: true };
  const amount = amountPair?.[1]?.replace(",", ".") ?? message.match(/(?:\$\s*)?(\d+(?:[.,]\d+)?)/u)?.[1]?.replace(",", ".") ?? null;
  const offset = amountPair ? 2 : 1;
  const sellToken = normalize(pair[offset]);
  const buyToken = normalize(pair[offset + 1]);
  const needsContractAddress = !KNOWN.test(sellToken) && !ADDRESS.test(sellToken) || !KNOWN.test(buyToken) && !ADDRESS.test(buyToken);
  return { requested: true, amount, sellToken, buyToken, needsContractAddress };
}
