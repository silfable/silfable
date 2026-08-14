export type ProviderRateBudgetSnapshot = {
  limit: number;
  windowMs: number;
  used: number;
  remaining: number;
  resetsAt: number | null;
};

/**
 * In-process sliding-window budget for outbound provider operations.
 *
 * This is deliberately not a retry queue. Once exhausted, the operation fails
 * before a network request is made. A later explicit user action may proceed
 * only after the oldest request leaves the window.
 */
export class ProviderRateBudget {
  readonly #name: string;
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #requests: number[] = [];

  constructor(input: {
    name: string;
    limit?: number;
    windowMs?: number;
    now?: () => number;
  }) {
    this.#name = input.name;
    this.#limit = input.limit ?? 120;
    this.#windowMs = input.windowMs ?? 60_000;
    this.#now = input.now ?? Date.now;
    if (!Number.isInteger(this.#limit) || this.#limit < 1 || this.#limit > 10_000) {
      throw new Error("Provider rate limit must be between 1 and 10,000.");
    }
    if (!Number.isInteger(this.#windowMs) || this.#windowMs < 1_000 || this.#windowMs > 86_400_000) {
      throw new Error("Provider rate window must be between one second and one day.");
    }
  }

  consume(): void {
    const now = this.#now();
    this.#purge(now);
    if (this.#requests.length >= this.#limit) {
      const resetsAt = (this.#requests[0] ?? now) + this.#windowMs;
      throw new Error(`${this.#name} request budget is exhausted. Retry after ${new Date(resetsAt).toISOString()}.`);
    }
    this.#requests.push(now);
  }

  snapshot(): ProviderRateBudgetSnapshot {
    const now = this.#now();
    this.#purge(now);
    return {
      limit: this.#limit,
      windowMs: this.#windowMs,
      used: this.#requests.length,
      remaining: this.#limit - this.#requests.length,
      resetsAt: this.#requests.length === 0 ? null : (this.#requests[0] ?? now) + this.#windowMs,
    };
  }

  #purge(now: number): void {
    const threshold = now - this.#windowMs;
    while (this.#requests.length > 0 && (this.#requests[0] ?? now) <= threshold) {
      this.#requests.shift();
    }
  }
}
