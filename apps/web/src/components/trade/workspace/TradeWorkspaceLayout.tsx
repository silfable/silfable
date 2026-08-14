import type { ReactNode } from "react";

interface TradeWorkspaceLayoutProps {
  children: ReactNode;
}

export function TradeWorkspaceLayout({ children }: TradeWorkspaceLayoutProps) {
  return <main className="workspace">{children}</main>;
}
