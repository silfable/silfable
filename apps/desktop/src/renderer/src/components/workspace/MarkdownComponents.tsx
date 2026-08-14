// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowUp, Bot, Brain } from 'lucide-react';
import { Button, Input, Modal } from '../ui';
import { shorten } from '../../lib/utils';
import { StatusPill, Notice } from '../setup/SetupHelpers';
import type { BridgeDestinationChain, ChatMessage } from '@silfable/contracts';
import { BRIDGE_DESTINATIONS, SOLANA_ADDRESS_PATTERN } from '../types';

export function BridgePreparationForm({
  busy,
  onPrepare,
}: {
  busy: boolean;
  onPrepare: (input: {
    destinationChain: BridgeDestinationChain;
    destinationRecipient: string;
    amountIn: string;
    minimumDestinationAmount: string;
    maximumTotalFeeUsd: number;
  }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [destinationChain, setDestinationChain] = useState<BridgeDestinationChain>("robinhood");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("1.00");
  // Small cross-chain transfers can have a meaningful fixed relayer cost. This is
  // deliberately a quote-discovery floor only; execution still needs its own review.
  const [minimum, setMinimum] = useState("0.50");
  const [maxFee, setMaxFee] = useState("0.25");
  const [error, setError] = useState<string | null>(null);
  function toRaw(value: string): string | null {
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    const raw = BigInt(whole ?? "0") * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
    return raw > 0n ? raw.toString() : null;
  }
  async function submit(): Promise<void> {
    const amountIn = toRaw(amount);
    const minimumDestinationAmount = toRaw(minimum);
    const maximumTotalFeeUsd = Number(maxFee);
    if (!/^0x[a-fA-F0-9]{40}$/u.test(recipient)) {
      setError(`Enter the exact ${BRIDGE_DESTINATIONS[destinationChain].label} recipient address (0x + 40 hexadecimal characters).`);
      return;
    }
     if (amountIn === null || minimumDestinationAmount === null || BigInt(minimumDestinationAmount) > BigInt(amountIn)) {
      setError("Enter valid USDC amounts; the minimum destination amount cannot exceed the source amount.");
      return;
    }
    if (!Number.isFinite(maximumTotalFeeUsd) || maximumTotalFeeUsd <= 0 || maximumTotalFeeUsd > 1_000) {
      setError("Enter a positive maximum total fee in USD.");
      return;
    }
    setError(null);
    try {
      await onPrepare({ destinationChain, destinationRecipient: recipient, amountIn, minimumDestinationAmount, maximumTotalFeeUsd });
      setOpen(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Bridge preflight failed safely.";
      if (/route output is below the contract minimum|quote is below the minimum destination amount/iu.test(message)) {
        const destinationSymbol = BRIDGE_DESTINATIONS[destinationChain].symbol;
        const quote = /provider quote:\s*(\d+)\s*raw (?:USDC|USDG)/iu.exec(message)?.[1];
        const floor = /requested minimum:\s*(\d+)\s*raw (?:USDC|USDG)/iu.exec(message)?.[1];
        const quoteText = quote === undefined ? "" : ` Provider quote: ${(Number(quote) / 1_000_000).toFixed(6)} ${destinationSymbol}.`;
        const floorText = floor === undefined ? "" : ` Your floor: ${(Number(floor) / 1_000_000).toFixed(6)} ${destinationSymbol}.`;
        setError(
          `The quoted route would deliver less than your Minimum on ${BRIDGE_DESTINATIONS[destinationChain].label} floor.${quoteText}${floorText} No transaction was created, signed, or broadcast. Lower the floor only if that quoted output is acceptable, or increase the source amount and request a fresh quote.`,
        );
      } else if (/total fee.*maximum|fee.*exceed/iu.test(message)) {
        const estimated = /estimated total:\s*\$([\d.]+)/iu.exec(message)?.[1];
        const maximum = /maximum:\s*\$([\d.]+)/iu.exec(message)?.[1];
        const estimateText = estimated === undefined ? "" : ` Provider estimate: $${estimated}.`;
        const maximumText = maximum === undefined ? "" : ` Your limit: $${maximum}.`;
        setError(
          `The quoted provider cost exceeds your Maximum total fee limit.${estimateText}${maximumText} No transaction was created, signed, or broadcast. Review the quoted cost before changing the limit.`,
        );
      } else if (/USDC balance does not cover the bridge amount/iu.test(message)) {
        const available = /available:\s*(\d+)\s*raw USDC/iu.exec(message)?.[1];
        const requested = /requested:\s*(\d+)\s*raw USDC/iu.exec(message)?.[1];
        const availableText = available === undefined ? "" : ` Available: ${(Number(available) / 1_000_000).toFixed(6)} USDC.`;
        const requestedText = requested === undefined ? "" : ` Requested: ${(Number(requested) / 1_000_000).toFixed(6)} USDC.`;
        setError(
          `The finalized source-wallet USDC balance is insufficient.${availableText}${requestedText} No quote, signature, or broadcast was attempted.`,
        );
      } else {
        setError(message);
      }
    }
  }
  return null;
}
export function friendlyError(error: unknown, fallback: string): string {
  const detail = error instanceof Error ? error.message.trim() : "";
  return detail.length > 0 ? detail.slice(0, 240) : fallback;
}
export function inferenceFailureMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  const prefix = "The inference request failed safely. No Mainnet action was attempted.";
  if (/status 401|status 403/i.test(detail))
    return `${prefix} OpenRouter rejected the saved API key. Reconfigure it in Settings.`;
  if (/status 402/i.test(detail))
    return `${prefix} The OpenRouter account has insufficient credit or requires payment.`;
  if (/status 429/i.test(detail))
    return `${prefix} OpenRouter rate-limited the request. Wait briefly or choose another compatible model.`;
  if (/timeout|timed out|aborted/i.test(detail))
    return `${prefix} OpenRouter did not respond before the timeout. Check the connection and try again.`;
  if (/no assistant message/i.test(detail))
    return `${prefix} The selected model returned no usable assistant response. Choose another compatible tool-capable model.`;
  if (/status 404|model/i.test(detail))
    return `${prefix} The saved OpenRouter model may no longer be available. Verify the key and select a current compatible model in Settings.`;
  return detail
    ? `${prefix} ${detail.slice(0, 180)}`
    : `${prefix} Verify the OpenRouter configuration in Settings and try again.`;
}
export function AnimatedMarkdownMessage({
  message,
  onComplete,
}: {
  message: ChatMessage;
  onComplete: () => void;
}) {
  const hasProposal = Boolean(
    message.missionPreview ||
    message.evmSwapProposal ||
    message.bridgeProposal ||
    message.pumpTradePreview ||
    message.limitOrderPreview
  );

  const [isFinished, setIsFinished] = useState(hasProposal);
  const [length, setLength] = useState(hasProposal ? (message.text?.length ?? 0) : 0);
  const completedRef = useRef(hasProposal);

  useEffect(() => {
    if (hasProposal || completedRef.current) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
      return;
    }

    if (!message.text || message.text.length <= 10) {
      setIsFinished(true);
      setLength(message.text?.length ?? 0);
      completedRef.current = true;
      onComplete();
      return;
    }

    setLength(0);
    const textLen = message.text.length;
    const increment = Math.max(10, Math.ceil(textLen / 20));

    const timer = window.setInterval(() => {
      setLength((current) => {
        const next = Math.min(textLen, current + increment);
        if (next >= textLen) {
          window.clearInterval(timer);
          return textLen;
        }
        return next;
      });
    }, 40);

    return () => {
      window.clearInterval(timer);
    };
  }, [message.id, hasProposal]);

  useEffect(() => {
    if (length >= (message.text?.length ?? 0) && !completedRef.current) {
      completedRef.current = true;
      setIsFinished(true);
      onComplete();
    }
  }, [length, message.text, onComplete]);

  return (
    <MarkdownMessage
      text={isFinished ? message.text : message.text.slice(0, length)}
      cursor={!isFinished}
    />
  );
}
export function MarkdownMessage({
  text,
  cursor = false,
}: {
  text: string;
  cursor?: boolean;
}) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/u.exec(line);
    if (heading) {
      const content = renderInlineMarkdown(heading[2] ?? "");
      blocks.push(
        heading[1]?.length === 1 ? (
          <h2 key={index}>{content}</h2>
        ) : (
          <h3 key={index}>{content}</h3>
        ),
      );
      index += 1;
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/u.exec(line);
    const unordered = /^[-*]\s+(.*)$/u.exec(line);
    if (ordered || unordered) {
      const items: React.ReactNode[] = [];
      const orderedList = Boolean(ordered);
      while (index < lines.length) {
        const match = orderedList
          ? /^\d+\.\s+(.*)$/u.exec(lines[index] ?? "")
          : /^[-*]\s+(.*)$/u.exec(lines[index] ?? "");
        if (!match) break;
        items.push(<li key={index}>{renderInlineMarkdown(match[1] ?? "")}</li>);
        index += 1;
      }
      blocks.push(
        orderedList ? (
          <ol key={`list-${index}`}>{items}</ol>
        ) : (
          <ul key={`list-${index}`}>{items}</ul>
        ),
      );
      continue;
    }
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !/^(#{1,4})\s+|^\d+\.\s+|^[-*]\s+/u.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(
      <p key={`p-${index}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>,
    );
  }
  return (
    <div className={`markdownMessage ${cursor ? "streaming" : ""}`}>
      {blocks}
    </div>
  );
}
export function renderInlineMarkdown(value: string): React.ReactNode[] {
  const parts = value.split(/(\*\*[^*]+\*\*|`[^`]+`)/gu);
  return parts
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    );
}
