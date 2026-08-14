import type { ReactNode } from "react";

export type CurrentTone = "ice" | "violet" | "orange" | "pearl" | "muted";

export function CurrentLabel({ children, tone = "ice" }: { children: ReactNode; tone?: CurrentTone }) {
  return <p className={`currentLabel currentTone-${tone}`}><span />{children}</p>;
}

export function InstrumentPanel({ children, className = "", tone = "ice" }: { children: ReactNode; className?: string; tone?: CurrentTone }) {
  return <div className={`instrumentPanel instrumentTone-${tone} ${className}`.trim()}>{children}</div>;
}

export function CurrentNode({ label, detail, state = "idle" }: { label: string; detail?: string; state?: "idle" | "complete" | "active" | "warning" }) {
  return <div className={`currentRailNode currentRailNode-${state}`}><i /><div><strong>{label}</strong>{detail && <small>{detail}</small>}</div></div>;
}

export function NetworkIdentity({ children, network = "solana" }: { children: ReactNode; network?: "solana" | "evm" }) {
  return <span className={`networkIdentity networkIdentity-${network}`}><i />{children}</span>;
}

export function StatusSignal({ children, state = "verified" }: { children: ReactNode; state?: "verified" | "active" | "warning" | "muted" }) {
  return <span className={`statusSignal statusSignal-${state}`}><i />{children}</span>;
}

export function DataLedger({ rows, className = "" }: { rows: Array<{ label: ReactNode; value: ReactNode }>; className?: string }) {
  return <dl className={`dataLedger ${className}`.trim()}>{rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>;
}
