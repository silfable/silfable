export type ProviderCircuitSnapshot = {
  state: "closed" | "open";
  consecutiveFailures: number;
  retryAt: number | null;
};

/**
 * A small in-process circuit breaker for read-only external-provider calls.
 * It intentionally has no retry or fallback behavior: callers decide whether a
 * request is safe to retry, and a provider outage must never become a mock
 * route, quote, or execution result.
 */
export class ProviderCircuitBreaker {
  readonly #name: string;
  readonly #failureThreshold: number;
  readonly #cooldownMs: number;
  readonly #now: () => number;
  #consecutiveFailures = 0;
  #openUntil = 0;

  constructor(input: {
    name: string;
    failureThreshold?: number;
    cooldownMs?: number;
    now?: () => number;
  }) {
    this.#name = input.name;
    this.#failureThreshold = input.failureThreshold ?? 3;
    this.#cooldownMs = input.cooldownMs ?? 30_000;
    this.#now = input.now ?? Date.now;
    if (!Number.isInteger(this.#failureThreshold) || this.#failureThreshold < 1) {
      throw new Error("Provider failure threshold must be a positive integer.");
    }
    if (!Number.isInteger(this.#cooldownMs) || this.#cooldownMs < 1_000) {
      throw new Error("Provider cooldown must be at least one second.");
    }
  }

  assertAvailable(): void {
    const now = this.#now();
    if (this.#openUntil > now) {
      throw new Error(`${this.#name} is temporarily unavailable. Retry after ${new Date(this.#openUntil).toISOString()}.`);
    }
    if (this.#openUntil !== 0) {
      this.#openUntil = 0;
      this.#consecutiveFailures = 0;
    }
  }

  recordSuccess(): void {
    this.#consecutiveFailures = 0;
    this.#openUntil = 0;
  }

  recordFailure(): void {
    if (this.#openUntil > this.#now()) return;
    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= this.#failureThreshold) {
      this.#openUntil = this.#now() + this.#cooldownMs;
    }
  }

  snapshot(): ProviderCircuitSnapshot {
    const now = this.#now();
    return {
      state: this.#openUntil > now ? "open" : "closed",
      consecutiveFailures: this.#consecutiveFailures,
      retryAt: this.#openUntil > now ? this.#openUntil : null,
    };
  }
}
