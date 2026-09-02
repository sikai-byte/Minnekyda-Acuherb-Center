/// A signed-in browser at the front desk is a shared surface: the absolute 8-hour session
/// life is not enough on its own, so a session also dies after a stretch of inactivity.
/// Kept free of request and database imports so the edge middleware can use it and so the
/// arithmetic is unit tested.

export const IDLE_TTL_MS = 30 * 60 * 1000;

/// How stale `lastSeenAt` may get before the cookie is rewritten. Without this every
/// request would issue a fresh Set-Cookie.
export const IDLE_REFRESH_MS = 60 * 1000;

export function idleExpired(lastSeenAt: number | undefined, now: number): boolean {
  if (lastSeenAt === undefined) return false;
  return now - lastSeenAt > IDLE_TTL_MS;
}

export function shouldRefreshIdle(lastSeenAt: number | undefined, now: number): boolean {
  if (lastSeenAt === undefined) return true;
  return now - lastSeenAt >= IDLE_REFRESH_MS;
}
