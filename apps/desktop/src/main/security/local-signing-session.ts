import type { LocalEncryptedKeystore } from "../storage/keystore.js";

export type LocalSigningSessionStatus = {
  active: boolean;
  expiresAt: string | null;
  reason: string | null;
};

/**
 * Keeps the authority window in memory only.  It deliberately stores neither
 * a password nor signing material: the encrypted keystore remains the sole
 * holder of private-key material and must still be unlocked for every use.
 */
export class LocalSigningSessionService {
  readonly #keystore: LocalEncryptedKeystore;
  #expiresAt: number | null = null;
  #active = false;
  #reason: string | null = "not enrolled";

  constructor(keystore: LocalEncryptedKeystore) {
    this.#keystore = keystore;
  }

  begin(expiresAt: string, now = new Date()): LocalSigningSessionStatus {
    const parsed = Date.parse(expiresAt);
    if (!Number.isFinite(parsed) || parsed <= now.getTime()) throw new Error("Signing session expiry must be in the future");
    if (parsed - now.getTime() > 24 * 60 * 60 * 1_000) throw new Error("Signing session cannot exceed 24 hours");
    if (this.#keystore.isLocked()) throw new Error("Unlock the local vault before enabling Full Access");
    this.#expiresAt = parsed;
    this.#active = true;
    this.#reason = null;
    return this.status(now);
  }

  beginUntilCleared(): LocalSigningSessionStatus {
    if (this.#keystore.isLocked()) throw new Error("Unlock the local vault before enabling Full Access");
    this.#active = true;
    this.#expiresAt = null;
    this.#reason = null;
    return this.status();
  }

  clear(reason: string): void {
    this.#expiresAt = null;
    this.#active = false;
    this.#reason = reason.slice(0, 200);
  }

  status(now = new Date()): LocalSigningSessionStatus {
    if (this.#active && (this.#keystore.isLocked() || (this.#expiresAt !== null && this.#expiresAt <= now.getTime()))) {
      this.clear(this.#keystore.isLocked() ? "local vault locked" : "signing session expired");
    }
    return {
      active: this.#active,
      expiresAt: this.#expiresAt === null ? null : new Date(this.#expiresAt).toISOString(),
      reason: this.#reason,
    };
  }

  assertActive(now = new Date()): void {
    const status = this.status(now);
    if (!status.active) throw new Error(`Local signing session is unavailable${status.reason === null ? "" : `: ${status.reason}`}`);
  }
}
