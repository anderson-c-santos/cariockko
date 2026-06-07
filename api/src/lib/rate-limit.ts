import type { Request, Response, NextFunction } from "express";

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory token-bucket rate limiter. Per-key. Refills `max` tokens
 * over `windowMs`. Intended for low-throughput protection against accidental
 * loops, not as a distributed rate limiter.
 */
export function rateLimit(options: {
  key: (req: Request) => string | null;
  max: number;
  windowMs: number;
  message?: string;
}) {
  const { key, max, windowMs, message = "Too many requests" } = options;

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    const k = key(req);
    if (!k) return next();

    const now = Date.now();
    const bucket = buckets.get(k) ?? { tokens: max, updatedAt: now };
    const elapsed = now - bucket.updatedAt;
    const refill = (elapsed / windowMs) * max;
    bucket.tokens = Math.min(max, bucket.tokens + refill);
    bucket.updatedAt = now;

    if (bucket.tokens < 1) {
      buckets.set(k, bucket);
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({ error: message });
      return;
    }

    bucket.tokens -= 1;
    buckets.set(k, bucket);
    next();
  };
}
