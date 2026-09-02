/// Kiosk mode: the iPad the patient holds must not be able to reach anything except the
/// one intake it was handed over for. Route enforcement lives in `src/middleware.ts`; this
/// module owns the path shape both sides agree on.

export function kioskPath(submissionId: string): string {
  return `/intake/${submissionId}`;
}

/// The only path a kiosk token may request is its own intake. Server actions post back to
/// the same path, and the completed-intake view (which links into the chart) is staff-only.
export function kioskAllowsPath(submissionId: string, pathname: string): boolean {
  return pathname === kioskPath(submissionId);
}
