interface RateLimiterOptions {
  getLimit?: number;
  writeLimit?: number;
  windowMs?: number;
}

type BucketType = "GET" | "WRITE";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimiter {
  private readonly limits: Record<BucketType, number>;
  private readonly windowMs: number;
  private readonly timestamps: Record<BucketType, number[]>;

  constructor(options: RateLimiterOptions = {}) {
    this.limits = {
      GET: options.getLimit ?? 60,
      WRITE: options.writeLimit ?? 20,
    };
    this.windowMs = options.windowMs ?? 60_000;
    this.timestamps = {
      GET: [],
      WRITE: [],
    };
  }

  async acquire(type: BucketType): Promise<void> {
    const now = Date.now();
    const bucket = this.timestamps[type];
    const limit = this.limits[type];

    // Remove timestamps older than the window
    this.pruneExpired(type, now);

    if (bucket.length < limit) {
      bucket.push(now);
      return;
    }

    // Bucket is full — wait until the oldest timestamp expires
    const oldest = bucket[0]!;
    const waitMs = oldest + this.windowMs - now;

    if (waitMs > 0) {
      await sleep(waitMs);
    }

    // After waiting, prune again and record new timestamp
    this.pruneExpired(type, Date.now());
    this.timestamps[type].push(Date.now());
  }

  reset(): void {
    this.timestamps.GET = [];
    this.timestamps.WRITE = [];
  }

  /** Get remaining requests and next reset time for a bucket. */
  getStatus(type: BucketType): { remaining: number; limit: number; resetInMs: number } {
    const now = Date.now();
    this.pruneExpired(type, now);
    const bucket = this.timestamps[type];
    const limit = this.limits[type];
    const remaining = Math.max(0, limit - bucket.length);
    const resetInMs = bucket.length > 0 ? (bucket[0]! + this.windowMs - now) : 0;
    return { remaining, limit, resetInMs: Math.max(0, resetInMs) };
  }

  /** Get status for all buckets. */
  getAllStatus(): Record<BucketType, { remaining: number; limit: number; resetInMs: number }> {
    return {
      GET: this.getStatus("GET"),
      WRITE: this.getStatus("WRITE"),
    };
  }

  private pruneExpired(type: BucketType, now: number): void {
    const bucket = this.timestamps[type];
    const cutoff = now - this.windowMs;
    // Find first index that is within the window
    let i = 0;
    while (i < bucket.length && bucket[i]! <= cutoff) {
      i++;
    }
    if (i > 0) {
      bucket.splice(0, i);
    }
  }
}
