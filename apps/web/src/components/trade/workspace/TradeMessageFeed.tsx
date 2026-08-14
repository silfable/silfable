import Image from "next/image";
import type { ReactNode, RefObject } from "react";
import type { WebMessage } from "@/lib/db";

interface TradeMessageFeedProps {
  messages: WebMessage[];
  activeSessionId: string;
  loading: boolean;
  viewportRef: RefObject<HTMLDivElement | null>;
  renderProposal: (message: WebMessage) => ReactNode;
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isLegacyProgressMessage(message: WebMessage): boolean {
  if (message.role !== "assistant" || message.proposal) return false;
  return /^(?:Exact USDG approval confirmed\.|Bridge source transaction confirmed on Robinhood Chain\.|Robinhood (?:→|â†’) Solana bridge confirmed after independent Solana USDC balance verification\.)/u.test(message.content.trim());
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/gu;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("**")) nodes.push(<strong key={`${start}-strong`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={`${start}-code`}>{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/u.exec(token);
      nodes.push(link ? <a key={`${start}-link`} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a> : token);
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function renderMessageContent(content: string): ReactNode[] {
  return content.split(/\n+/u).filter(Boolean).map((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("### ")) return <h3 key={`${trimmed}-${index}`}>{renderInlineMarkdown(trimmed.replace(/^###\s+/u, ""))}</h3>;
    if (trimmed.startsWith("## ")) return <h2 key={`${trimmed}-${index}`}>{renderInlineMarkdown(trimmed.replace(/^##\s+/u, ""))}</h2>;
    if (/^[-*]\s+/u.test(trimmed)) return <p key={`${trimmed}-${index}`} className="messageBullet">• {renderInlineMarkdown(trimmed.replace(/^[-*]\s+/u, ""))}</p>;
    if (/^\d+\.\s+/u.test(trimmed)) {
      const match = /^(\d+\.)\s+(.+)$/u.exec(trimmed);
      return <p key={`${trimmed}-${index}`} className="messageBullet">{match?.[1]} {renderInlineMarkdown(match?.[2] ?? trimmed)}</p>;
    }
    return <p key={`${trimmed}-${index}`}>{renderInlineMarkdown(trimmed)}</p>;
  });
}

export function TradeMessageFeed({ messages, activeSessionId, loading, viewportRef, renderProposal }: TradeMessageFeedProps) {
  return (
    <div className="messages" ref={viewportRef}>
      {messages
        .filter((message) => message.sessionId === activeSessionId && !isLegacyProgressMessage(message))
        .map((message) => (
          <article key={message.id} className={message.role}>
            {message.role === "assistant" && (
              <div className="avatar shrink-0" aria-hidden="true">
                <Image src="/logo.png" alt="" width={20} height={20} className="avatarLogo" />
              </div>
            )}
            <div>
              <small className="mb-1.5 block text-[8px] uppercase tracking-[0.1em] text-[var(--muted)]">
                {message.role === "user" ? "You" : "Silfable"} <span aria-hidden="true">·</span>{" "}
                <time dateTime={new Date(message.createdAt).toISOString()}>{formatMessageTime(message.createdAt)}</time>
              </small>
              <div className="markdownMessage">{renderMessageContent(message.content)}</div>
              {renderProposal(message)}
            </div>
          </article>
        ))}
      {loading && <div className="typingIndicator"><span /><span /><span /></div>}
    </div>
  );
}
