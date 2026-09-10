export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
}

export class RateLimiterService {
  private windows = new Map<string, number[]>();

  /**
   * Sliding window 60-second rate limiter
   */
  checkRateLimit(keyId: string, limitRpm = 60): RateLimitResult {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const windowStart = now - windowMs;

    let timestamps = this.windows.get(keyId) || [];
    // Discard timestamps older than 60 seconds
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= limitRpm) {
      const oldest = timestamps[0];
      const resetSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.windows.set(keyId, timestamps);

      return {
        allowed: false,
        limit: limitRpm,
        remaining: 0,
        resetSeconds,
      };
    }

    timestamps.push(now);
    this.windows.set(keyId, timestamps);

    const remaining = Math.max(0, limitRpm - timestamps.length);
    const resetSeconds = 60;

    return {
      allowed: true,
      limit: limitRpm,
      remaining,
      resetSeconds,
    };
  }

  reset(keyId?: string): void {
    if (keyId) {
      this.windows.delete(keyId);
    } else {
      this.windows.clear();
    }
  }
}
