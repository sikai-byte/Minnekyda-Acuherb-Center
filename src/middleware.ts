import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { idleExpired, shouldRefreshIdle } from '@/lib/idle';
import { kioskAllowsPath, kioskPath } from '@/lib/kiosk';
import { patientAllowsPath } from '@/lib/portalScope';
import {
  kioskSessionOptions,
  sessionOptions,
  type AppSession,
  type KioskSession,
} from '@/lib/session-options';

/// Every route is authenticated unless it appears here. Adding a page therefore cannot
/// accidentally expose PHI: the default is deny, and page-level `requireRole` narrows
/// further. Kiosk tokens are additionally confined to their own intake (see lib/kiosk).
const PUBLIC_PATHS = ['/login', '/login/mfa', '/login/mfa/setup'];

/// The public booking site, open to someone who has never been here. It shows open times and
/// takes contact details; it reads no chart and renders no patient data, so an anonymous
/// visitor learns nothing about anyone but themselves.
const PUBLIC_BOOKING_PATHS = ['/book'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_BOOKING_PATHS.includes(pathname);
}

function securityHeaders(headers: Headers, nonce: string): void {
  const dev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    // Next's inline bootstrap scripts carry this nonce; dev additionally needs eval for HMR.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // Signatures are captured on a canvas and rendered back as data URLs.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');

  headers.set('Content-Security-Policy', csp);
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // PHI must never sit in a shared or browser cache.
  headers.set('Cache-Control', 'no-store, max-age=0');
  if (!dev) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  securityHeaders(requestHeaders, nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  securityHeaders(response.headers, nonce);

  const kiosk = await getIronSession<KioskSession>(request, response, kioskSessionOptions());
  if (kiosk.submissionId) {
    /// A patient holding the iPad stays on their own intake: the booking site is public, but
    /// it is still a way off the one page this device is meant to show.
    if (PUBLIC_PATHS.includes(pathname) || kioskAllowsPath(kiosk.submissionId, pathname)) {
      return response;
    }
    return NextResponse.redirect(new URL(kioskPath(kiosk.submissionId), request.url), {
      headers: response.headers,
    });
  }

  if (isPublic(pathname)) return response;

  const session = await getIronSession<AppSession>(request, response, sessionOptions());
  if (!session.user) {
    return NextResponse.redirect(new URL('/login', request.url), { headers: response.headers });
  }

  /// A browser left signed in at the front desk stops being a signed-in browser.
  const now = Date.now();
  if (idleExpired(session.lastSeenAt, now)) {
    session.destroy();
    const url = new URL('/login', request.url);
    url.searchParams.set('reason', 'idle');
    return NextResponse.redirect(url, { headers: response.headers });
  }
  if (shouldRefreshIdle(session.lastSeenAt, now)) {
    session.lastSeenAt = now;
    await session.save();
  }

  /// Page guards already bounce a PATIENT session off every staff route; this stops the
  /// request before it reaches one.
  if (session.user.role === 'PATIENT' && !patientAllowsPath(pathname)) {
    return NextResponse.redirect(new URL('/portal', request.url), { headers: response.headers });
  }

  return response;
}

export const config = {
  /// `brand/` and `icon.svg` are the clinic's own logo files: no chart data, and they have to
  /// load on the sign-in and public booking screens where there is no session yet.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|brand/).*)'],
};
