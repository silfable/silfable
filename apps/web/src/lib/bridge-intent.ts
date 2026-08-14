export type BridgeConversationMessage = {
  role?: "user" | "assistant";
  content?: string;
};

export type SolanaBridgeIntent = {
  requested: boolean;
  amountUsdc: number | null;
  destinationRecipient: string | null;
};

const BRIDGE_REQUEST = /\bbridge\b|\bjembatan\b|\bjembatani\b/iu;
const ROBINHOOD_DESTINATION = /\brobinhood\b/iu;
const BRIDGE_FOLLOW_UP = /0x[0-9a-f]{40}|\busdc\b|\balamat\b|\baddress\b|\bdefault\b|\bmaks(?:imal)?\b|\bmaximum\b/iu;

function parseUsdcAmount(text: string): number | null {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*usdc\b/iu);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function findEvmRecipient(text: string): string | null {
  return text.match(/0x[0-9a-f]{40}/iu)?.[0] ?? null;
}

export function resolveSolanaBridgeIntent(messages: BridgeConversationMessage[]): SolanaBridgeIntent {
  const recent = messages.slice(-10);
  let bridgeAnchor = -1;
  let lastUserIndex = -1;
  for (let index = 0; index < recent.length; index += 1) {
    const message = recent[index];
    if (message.role !== "user" || typeof message.content !== "string") continue;
    lastUserIndex = index;
    if (BRIDGE_REQUEST.test(message.content) && ROBINHOOD_DESTINATION.test(message.content)) bridgeAnchor = index;
  }
  if (bridgeAnchor < 0 || lastUserIndex < bridgeAnchor) return { requested: false, amountUsdc: null, destinationRecipient: null };

  const lastUserContent = recent[lastUserIndex]?.content ?? "";
  if (bridgeAnchor !== lastUserIndex && !BRIDGE_FOLLOW_UP.test(lastUserContent)) {
    return { requested: false, amountUsdc: null, destinationRecipient: null };
  }

  const context = recent
    .slice(bridgeAnchor, lastUserIndex + 1)
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .map((message) => message.content)
    .join("\n");
  return { requested: true, amountUsdc: parseUsdcAmount(context), destinationRecipient: findEvmRecipient(context) };
}
