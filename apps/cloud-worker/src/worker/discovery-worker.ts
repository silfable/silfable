/**
 * Legacy compatibility entry point. Discovery-to-buy is disabled. Token
 * research may only produce read-only evidence and user-reviewable proposals.
 */
export function startDiscoveryWorker() {
  console.warn("[Discovery Worker] Disabled: autonomous execution is frozen.");
  return () => undefined;
}
