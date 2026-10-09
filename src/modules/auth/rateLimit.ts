interface Bucket {
  windowStart: number;
  current: number;
  previous: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Limiteur a fenetre glissante ponderee, en memoire, par cle.
 *
 * Pour chaque cle on garde le compteur de la fenetre courante et celui de la fenetre
 * precedente. Le nombre estime = precedent x (1 - fraction ecoulee) + courant, ce qui
 * lisse la bascule de fenetre (contrairement a une fenetre fixe). L'horloge est
 * injectable pour des tests deterministes.
 *
 * Suffisant en mono-instance ; un backend partage (Redis) prendrait le relais en
 * multi-instance.
 */
export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Consomme une unite pour la cle et retourne l'etat de la limite. */
  check(key: string, limit: number): RateLimitResult {
    const now = this.now();
    const windowStart = Math.floor(now / this.windowMs) * this.windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { windowStart, current: 0, previous: 0 };
      this.buckets.set(key, bucket);
    } else if (windowStart > bucket.windowStart) {
      const adjacent = windowStart - bucket.windowStart === this.windowMs;
      bucket.previous = adjacent ? bucket.current : 0;
      bucket.current = 0;
      bucket.windowStart = windowStart;
    }

    const weight = 1 - (now - windowStart) / this.windowMs;
    const estimated = bucket.previous * weight + bucket.current;

    if (estimated >= limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((windowStart + this.windowMs - now) / 1000)),
      };
    }

    bucket.current += 1;
    const used = bucket.previous * weight + bucket.current;
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, Math.floor(limit - used)),
      retryAfterSeconds: 0,
    };
  }
}
