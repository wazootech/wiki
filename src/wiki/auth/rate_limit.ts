/** Minimal in-memory failure limiter for password login attempts. */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface Attempt {
  readonly count: number;
  readonly resetAt: number;
}

const attempts = new Map<string, Attempt>();

export function isRateLimited(key: string): boolean {
  const attempt = attempts.get(key);
  if (attempt === undefined) return false;
  if (attempt.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return attempt.count >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const attempt = attempts.get(key);
  const now = Date.now();
  if (attempt === undefined || attempt.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  attempts.set(key, {
    count: attempt.count + 1,
    resetAt: attempt.resetAt,
  });
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
