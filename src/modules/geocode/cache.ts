/** Cache LRU borne, en memoire (evince l'entree la moins recemment utilisee). */
export class LruCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly maxSize: number) {}

  /** Retourne la valeur et la marque comme recemment utilisee. */
  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  /** Insere une valeur et evince l'entree la plus ancienne si la borne est depassee. */
  set(key: string, value: T): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
