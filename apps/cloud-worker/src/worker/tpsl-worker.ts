/**
 * Legacy compatibility entry point. See dca-worker.ts for the security
 * boundary. A stored threshold is not transaction authority.
 */
export function startTpSlWorker() {
  console.warn("[TP/SL Worker] Disabled: cloud execution is frozen.");
  return () => undefined;
}
