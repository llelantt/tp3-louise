interface Window {
  count: number;
  resetAt: number;
}

/**
 * Limiteur a fenetre glissante fixe, en memoire, par cle.
 * Volontairement simple : suffisant pour un deploiement mono-instance ; un
 * backend partage (Redis) prendrait le relais en multi-instance.
 */
export class SlidingWindowLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Consomme une unite pour la cle ; retourne false si la limite est depassee. */
  consume(key: string, limit: number): boolean {
    const current = this.now();
    const existing = this.windows.get(key);
    if (!existing || existing.resetAt <= current) {
      this.windows.set(key, { count: 1, resetAt: current + this.windowMs });
      return true;
    }
    if (existing.count >= limit) return false;
    existing.count += 1;
    return true;
  }
}
