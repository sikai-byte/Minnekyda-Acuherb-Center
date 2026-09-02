import { describe, expect, it } from 'vitest';
import { IDLE_REFRESH_MS, IDLE_TTL_MS, idleExpired, shouldRefreshIdle } from './idle';

const NOW = 1_700_000_000_000;

describe('idle session expiry', () => {
  it('keeps an active session alive', () => {
    expect(idleExpired(NOW - 60 * 1000, NOW)).toBe(false);
    expect(idleExpired(NOW - IDLE_TTL_MS, NOW)).toBe(false);
  });

  it('expires a session left sitting', () => {
    expect(idleExpired(NOW - IDLE_TTL_MS - 1, NOW)).toBe(true);
    expect(idleExpired(NOW - 8 * 60 * 60 * 1000, NOW)).toBe(true);
  });

  /// Sessions issued before this shipped carry no timestamp; they get one instead of being
  /// thrown out mid-visit.
  it('does not expire a session that has no timestamp yet', () => {
    expect(idleExpired(undefined, NOW)).toBe(false);
    expect(shouldRefreshIdle(undefined, NOW)).toBe(true);
  });

  it('rewrites the cookie at most once a minute', () => {
    expect(shouldRefreshIdle(NOW - IDLE_REFRESH_MS + 1, NOW)).toBe(false);
    expect(shouldRefreshIdle(NOW - IDLE_REFRESH_MS, NOW)).toBe(true);
  });
});
