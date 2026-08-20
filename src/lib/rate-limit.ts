/**
 * Rate limiter keyed by API key.
 * Each key has its own daily limit (from api-keys.ts tier).
 * Resets at midnight UTC.
 */

interface BucketEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, BucketEntry>();

// Clean up expired buckets every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) {
      buckets.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

function getResetTime(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return tomorrow.getTime();
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
}

/**
 * Consume one unit from a bucket.
 *
 * A rejected request is NOT charged. The old behaviour incremented before
 * checking, so a client that kept hammering after its 429 drove the counter
 * arbitrarily far past the limit. That did not change who was blocked today —
 * the bucket was already exhausted either way — but it made `count` useless as a
 * record of served traffic, and on a shared bucket it hid how much of the pool
 * real users had actually been given.
 */
export function checkRateLimit(bucketKey: string, dailyLimit: number): RateLimitResult {
  const now = Date.now();
  let entry = buckets.get(bucketKey);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: getResetTime() };
    buckets.set(bucketKey, entry);
  }

  if (entry.count >= dailyLimit) {
    return { allowed: false, remaining: 0, limit: dailyLimit, resetAt: entry.resetAt };
  }

  entry.count++;

  return {
    allowed: true,
    remaining: Math.max(0, dailyLimit - entry.count),
    limit: dailyLimit,
    resetAt: entry.resetAt,
  };
}

/**
 * How much of a bucket is left, without consuming any of it. For checking a
 * second bucket after the first has already been charged, so a request that is
 * going to be refused anyway does not eat someone else's quota.
 */
export function peekRateLimit(bucketKey: string, dailyLimit: number): RateLimitResult {
  const entry = buckets.get(bucketKey);
  const fresh = !entry || Date.now() >= entry.resetAt;
  const count = fresh ? 0 : entry!.count;
  return {
    allowed: count < dailyLimit,
    remaining: Math.max(0, dailyLimit - count),
    limit: dailyLimit,
    resetAt: fresh ? getResetTime() : entry!.resetAt,
  };
}

export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
  };
}
