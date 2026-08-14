import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "neutral";
  size?: "sm" | "md";
}

const variants = {
  success: "border-emerald-300/25 bg-emerald-400/10 text-emerald-300",
  warning: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  danger: "border-red-300/25 bg-red-400/10 text-red-300",
  info: "border-emerald-300/25 bg-emerald-400/10 text-emerald-200",
  neutral: "border-slate-300/15 bg-slate-400/10 text-slate-300",
};

export function Badge({ children, variant = "info", size = "md", className, ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center justify-center rounded-md border font-mono font-semibold uppercase tracking-[0.06em]", size === "sm" ? "px-1.5 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]", variants[variant], className)} {...props}>{children}</span>;
}
