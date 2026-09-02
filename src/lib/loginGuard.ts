import { headers } from 'next/headers';
import { prisma } from './db';

/// Brute-force protection. Failures are counted per account and per source address over a
/// rolling window; the account limit is the tighter of the two because a clinic shares one
/// public IP. A successful sign-in resets the account's count by moving the window forward,
/// not by deleting rows: the attempt log is security evidence and is never pruned here.
const WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

export const LOCKOUT_MESSAGE =
  'Too many sign-in attempts. Wait 15 minutes or ask an administrator to reset your password.';

export function requestIp(): string | null {
  const forwarded = headers().get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() ?? headers().get('x-real-ip');
}

export { passwordPolicyError } from './password';

export async function isLockedOut(email: string, ip: string | null): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { email, success: true },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const emailSince =
    lastSuccess && lastSuccess.createdAt > windowStart ? lastSuccess.createdAt : windowStart;

  const byEmail = await prisma.loginAttempt.count({
    where: { email, success: false, createdAt: { gt: emailSince } },
  });
  if (byEmail >= MAX_FAILURES_PER_EMAIL) return true;

  if (!ip) return false;
  const byIp = await prisma.loginAttempt.count({
    where: { ip, success: false, createdAt: { gte: windowStart } },
  });
  return byIp >= MAX_FAILURES_PER_IP;
}

export async function recordAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
  reason?: string;
}): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        email: input.email,
        ip: input.ip,
        success: input.success,
        reason: input.reason ?? null,
      },
    });
  } catch (error) {
    /// Never block a clinician from signing in because the attempt log is unavailable, but
    /// this is a security control failing and must be visible in monitoring. No PHI here:
    /// staff email and reason code only.
    console.error('login attempt log write failed', {
      reason: input.reason ?? null,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}
