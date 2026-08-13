export type Eip1193Provider = {
  request(input: { method: string; params?: readonly unknown[] | object }): Promise<unknown>;
  on?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
  removeListener?(event: "accountsChanged" | "chainChanged", listener: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export async function requestEvmAccount(): Promise<{ address: `0x${string}`; chainId: number }> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No EVM wallet extension was found. Install MetaMask, Rabby, or another EIP-1193 wallet.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const chainIdHex = await provider.request({ method: "eth_chainId" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string" || !/^0x[0-9a-f]{40}$/iu.test(accounts[0])) {
    throw new Error("The EVM wallet did not return a valid account.");
  }
  const chainId = typeof chainIdHex === "string" ? Number.parseInt(chainIdHex, 16) : Number.NaN;
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("The EVM wallet returned an invalid chain ID.");
  return { address: accounts[0] as `0x${string}`, chainId };
}

export async function signEvmAuthenticationMessage(address: `0x${string}`, message: string): Promise<`0x${string}`> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No EVM wallet extension is available.");
  const signature = await provider.request({ method: "personal_sign", params: [message, address] });
  if (typeof signature !== "string" || !/^0x[0-9a-f]+$/iu.test(signature)) {
    throw new Error("The wallet did not return a valid EVM signature.");
  }
  return signature as `0x${string}`;
}

export async function switchToRobinhoodChain(customRpcUrl?: string): Promise<void> {
  const provider = window.ethereum;
  if (!provider) throw new Error("No EVM wallet extension is available.");
  const chainId = "0x1237";
  const network = {
    chainId,
    chainName: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: [customRpcUrl?.trim() || "https://rpc.mainnet.chain.robinhood.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
  };
  // Wallet extensions own their network list. Re-register the configured RPC
  // first so extensions that support updating an existing network can use it.
  if (customRpcUrl?.trim()) {
    try {
      await provider.request({ method: "wallet_addEthereumChain", params: [network] });
    } catch (cause) {
      if ((cause as { code?: number }).code === 4_001) throw cause;
      // Some wallets reject an existing chain instead of updating it. The
      // switch below still confirms the active chain; their UI remains the
      // authority for editing an existing RPC entry.
    }
  }
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (cause) {
    if ((cause as { code?: number }).code !== 4_902) throw cause;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [network],
    });
  }
}
