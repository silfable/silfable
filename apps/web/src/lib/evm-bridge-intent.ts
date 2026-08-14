export type EvmToSolanaBridgeIntent = {
  requested: boolean;
  amountUsdg: string | null;
  destinationRecipient: string | null;
};

export type BridgeConversationMessage = {
  role?: "user" | "assistant";
  content?: string;
};

const BRIDGE_REQUEST = /\b(?:bridge|jembatan|jembatani)\b/iu;
const SOLANA_DESTINATION = /\bsolana\b/iu;
const ROBINHOOD_SOURCE = /\b(?:robinhood|usdg)\b/iu;
const REVERSE_DIRECTION = /(?:\brobinhood\b|\busdg\b)[\s\S]{0,80}(?:\bke\b|\bto\b|->|â†’)[\s\S]{0,80}\bsolana\b/iu;
const FOLLOW_UP = /\busdg\b|\bsolana\b|\balamat\b|\baddress\b|[1-9A-HJ-NP-Za-km-z]{32,44}/iu;

function parseAmount(text: string): string | null {
  const match = text.match(/(?:\$\s*)?(\d+(?:[.,]\d{1,6})?)\s*usdg\b/iu);
  if (!match?.[1]) return null;
  const normalized = match[1].replace(",", ".");
  return Number(normalized) > 0 ? normalized : null;
}

function findSolanaRecipient(text: string): string | null {
  const matches = text.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/gu) ?? [];
  return matches.find((value) => !/^(?:robinhood|solana|bridge)$/iu.test(value)) ?? null;
}

/** Resolves only the Robinhood USDG -> Solana USDC direction. */
export function resolveEvmToSolanaBridgeIntent(messages: BridgeConversationMessage[]): EvmToSolanaBridgeIntent {
  const recent = messages.slice(-10);
  let bridgeAnchor = -1;
  let lastUserIndex = -1;
  for (let index = 0; index < recent.length; index += 1) {
    const message = recent[index];
    if (message.role !== "user" || typeof message.content !== "string") continue;
    lastUserIndex = index;
    const content = message.content;
    const reverseRequest = BRIDGE_REQUEST.test(content)
      && SOLANA_DESTINATION.test(content)
      && ROBINHOOD_SOURCE.test(content)
      && (REVERSE_DIRECTION.test(content) || !/\bsolana\b[\s\S]{0,80}(?:\bke\b|\bto\b|->|â†’)[\s\S]{0,80}\brobinhood\b/iu.test(content));
    if (reverseRequest) bridgeAnchor = index;
  }
  if (bridgeAnchor < 0 || lastUserIndex < bridgeAnchor) return { requested: false, amountUsdg: null, destinationRecipient: null };
  const lastUserContent = recent[lastUserIndex]?.content ?? "";
  if (bridgeAnchor !== lastUserIndex && !FOLLOW_UP.test(lastUserContent)) {
    return { requested: false, amountUsdg: null, destinationRecipient: null };
  }
  const context = recent
    .slice(bridgeAnchor, lastUserIndex + 1)
    .filter((message) => message.role === "user" && typeof message.content === "string")
    .map((message) => message.content)
    .join("\n");
  return { requested: true, amountUsdg: parseAmount(context), destinationRecipient: findSolanaRecipient(context) };
}
