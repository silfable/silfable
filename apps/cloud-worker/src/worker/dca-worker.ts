/**
 * Legacy compatibility entry point.
 *
 * Cloud scheduling is intentionally frozen until wallet-scoped authentication,
 * delegated authority, policy enforcement, and revocation are independently
 * audited. This function performs no reads, writes, queue operations, signing,
 * or broadcasts.
 */
export function startDcaWorker() {
  console.warn("[DCA Worker] Disabled: cloud execution is frozen.");
  return () => undefined;
}
