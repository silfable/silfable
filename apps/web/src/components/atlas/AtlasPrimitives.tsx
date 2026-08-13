import type { ReactNode } from "react";

type Tone = "coral" | "citron" | "aqua" | "lilac" | "bone";

export function AtlasKicker({ children, tone = "aqua" }: { children: ReactNode; tone?: Tone }) {
  return <p className={`atlasKicker atlasTone-${tone}`}>{children}</p>;
}

export function NetworkBadge({ children, tone }: { children: ReactNode; tone: "aqua" | "lilac" | "coral" }) {
  return <span className={`atlasBadge atlasTone-${tone}`}><span className="atlasBadgeDot" />{children}</span>;
}

export function StatusMarker({ children, tone = "citron" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`atlasStatus atlasTone-${tone}`}><span className="atlasStatusDot" />{children}</span>;
}

export function AtlasPanel({ children, className = "", tone = "bone" }: { children: ReactNode; className?: string; tone?: Tone }) {
  return <div className={`atlasPanel atlasPanel-${tone} ${className}`.trim()}>{children}</div>;
}

export function RouteNode({ label, detail, tone = "aqua", active = false }: { label: string; detail?: string; tone?: Tone; active?: boolean }) {
  return (
    <div className={`routeNode atlasTone-${tone} ${active ? "isActive" : ""}`}>
      <span className="routeNodeMark" />
      <div><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</div>
    </div>
  );
}

export function WingMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`wingMark ${className}`} viewBox="0 0 260 180" aria-hidden="true">
      <path d="M128 88C97 42 52 18 13 34c23 35 62 57 115 54Z" />
      <path d="M132 88c31-46 76-70 115-54-23 35-62 57-115 54Z" />
      <path d="M126 94c-38-7-74 7-96 37 34 14 69 2 101-33" />
      <path d="M134 94c38-7 74 7 96 37-34 14-69 2-101-33" />
      <path d="M130 55v101" />
      <circle cx="130" cy="48" r="7" />
    </svg>
  );
}
