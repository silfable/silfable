import React from "react";

export type SupportedNetwork = "SOLANA_MAINNET" | "ROBINHOOD_CHAIN";

export interface NetworkSwitcherProps {
  currentNetwork: SupportedNetwork;
  onNetworkChange: (network: SupportedNetwork) => void;
}

export const NetworkSwitcher: React.FC<NetworkSwitcherProps> = ({ currentNetwork, onNetworkChange }) => {
  return (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1.5 rounded-lg text-xs font-mono">
      <span className="text-slate-400 pl-1 uppercase text-[10px] tracking-wider">Network:</span>
      <button
        type="button"
        onClick={() => onNetworkChange("SOLANA_MAINNET")}
        className={`px-2.5 py-1 rounded font-medium transition-colors ${
          currentNetwork === "SOLANA_MAINNET"
            ? "bg-purple-600/30 text-purple-300 border border-purple-500/40"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Solana Mainnet
      </button>
      <button
        type="button"
        onClick={() => onNetworkChange("ROBINHOOD_CHAIN")}
        className={`px-2.5 py-1 rounded font-medium transition-colors ${
          currentNetwork === "ROBINHOOD_CHAIN"
            ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40"
            : "text-slate-400 hover:text-slate-200"
        }`}
      >
        Robinhood Chain (EVM 4663)
      </button>
    </div>
  );
};
