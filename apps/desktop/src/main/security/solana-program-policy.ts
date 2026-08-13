export type SolanaProgramCapability =
  | "system-account-management"
  | "compute-budget"
  | "associated-token-account"
  | "spl-token"
  | "spl-token-2022"
  | "jupiter-route"
  | "jupiter-okx-route"
  | "memo"
  | "pump-token-launch"
  | "pump-mayhem-support"
  | "dln-bridge-source"
  | "relay-bridge-source";

export type SolanaProgramPolicyEntry = {
  address: string;
  capability: SolanaProgramCapability;
  lanes: readonly ("jupiter-swap" | "pump-token-launch" | "bridge-solana-source")[];
  rationale: string;
};

/**
 * Release-controlled Solana program manifest.
 *
 * Adding an address here is a security-sensitive change. It must identify the
 * narrow capability required by a named lane and receive the same simulation,
 * controlled-Mainnet, and signed-build review as the calling lane.
 */
export const SOLANA_PROGRAM_POLICY: readonly SolanaProgramPolicyEntry[] = [
  { address: "11111111111111111111111111111111", capability: "system-account-management", lanes: ["jupiter-swap", "pump-token-launch", "bridge-solana-source"], rationale: "Creates or funds accounts required by the inspected transaction." },
  { address: "ComputeBudget111111111111111111111111111111", capability: "compute-budget", lanes: ["jupiter-swap", "pump-token-launch", "bridge-solana-source"], rationale: "Bounds compute units and priority price before signing." },
  { address: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", capability: "associated-token-account", lanes: ["jupiter-swap", "pump-token-launch", "bridge-solana-source"], rationale: "Creates canonical associated token accounts." },
  { address: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", capability: "spl-token", lanes: ["jupiter-swap", "bridge-solana-source"], rationale: "Moves legacy SPL tokens used by an inspected Jupiter route." },
  { address: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", capability: "spl-token-2022", lanes: ["jupiter-swap", "pump-token-launch", "bridge-solana-source"], rationale: "Owns Token-2022 mints and accounts used by supported flows." },
  { address: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", capability: "jupiter-route", lanes: ["jupiter-swap"], rationale: "Canonical Jupiter route program inspected in unsigned swaps." },
  { address: "proVF4pMXVaYqmy4NjniPh4pqKNfMmsihgd4wdkCX3u", capability: "jupiter-okx-route", lanes: ["jupiter-swap"], rationale: "OKX Aggregator V6 route selected by Jupiter Ultra." },
  { address: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr", capability: "memo", lanes: ["jupiter-swap"], rationale: "Carries bounded non-authoritative route metadata." },
  { address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P", capability: "pump-token-launch", lanes: ["pump-token-launch"], rationale: "Official Pump program pinned for the inspected create_v2 instruction." },
  { address: "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e", capability: "pump-mayhem-support", lanes: ["pump-token-launch"], rationale: "Pinned account-support program required by the conservative create_v2 layout." },
  { address: "src5qyZHqTqecJV4aY6Cb6zDZLMDzrDKKezs22MPHr4", capability: "dln-bridge-source", lanes: ["bridge-solana-source"], rationale: "Official DLN deBridge source program for cross-chain swaps." },
  { address: "99vQwtBwYtrqqD9YSXbdum3KBdxPAVxYTaQ3cfnJSrN2", capability: "relay-bridge-source", lanes: ["bridge-solana-source"], rationale: "Official Relay bridge source program for Solana bridging." },
] as const;

export function allowedSolanaPrograms(
  lane: "jupiter-swap" | "pump-token-launch" | "bridge-solana-source",
): ReadonlySet<string> {
  return new Set(
    SOLANA_PROGRAM_POLICY
      .filter((entry) => entry.lanes.includes(lane))
      .map((entry) => entry.address),
  );
}
