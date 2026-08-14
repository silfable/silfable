import React from "react";

export type SupportedNetwork = "SOLANA_MAINNET" | "ROBINHOOD_CHAIN";

export interface NetworkSwitcherProps {
  currentNetwork: SupportedNetwork;
  onNetworkChange: (network: SupportedNetwork) => void;
}

export const NetworkSwitcher: React.FC<NetworkSwitcherProps> = ({ currentNetwork, onNetworkChange }) => {
  return (
    <div className="flex items-center gap-2 border border-[#ff8a00]/20 bg-[#11100f] p-1.5 rounded-lg text-xs font-mono">
      <span className="text-[#b8aa9c] pl-1 uppercase text-[10px] tracking-wider">Network:</span>
      <button
        type="button"
        onClick={() => onNetworkChange("SOLANA_MAINNET")}
        className={`px-2.5 py-1 rounded font-medium transition-colors ${
          currentNetwork === "SOLANA_MAINNET"
            ? "bg-[#ff8a00]/15 text-[#ffad45] border border-[#ff8a00]/50"
            : "text-[#b8aa9c] hover:bg-[#ff8a00]/8 hover:text-[#ffad45]"
        }`}
      >
        Solana Mainnet
      </button>
      <button
        type="button"
        onClick={() => onNetworkChange("ROBINHOOD_CHAIN")}
        className={`px-2.5 py-1 rounded font-medium transition-colors ${
          currentNetwork === "ROBINHOOD_CHAIN"
            ? "bg-[#ff8a00]/15 text-[#ffad45] border border-[#ff8a00]/50"
            : "text-[#b8aa9c] hover:bg-[#ff8a00]/8 hover:text-[#ffad45]"
        }`}
      >
        Robinhood Chain (EVM 4663)
      </button>
    </div>
  );
};
