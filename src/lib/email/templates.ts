import { CLINIC_TIME_ZONE } from '@/lib/scheduling/time';

/// What the clinic's email actually says. Pure functions of a few logistics fields, so the
/// wording is testable and there is exactly one place to check what leaves the building.
///
/// What is deliberately absent is as much of the design as what is present:
/// - no reason for the visit, symptom, diagnosis or note content — none of it exists in the
///   scheduling tables to begin with;
/// - no appointment type name either, even though it is only a service label. "Initial
///   consultation" is harmless, but the clinic can rename a type at any time, and a type
///   called after a condition would turn every confirmation into a disclosure to an inbox the
///   clinic does not control. Emails say "your visit";
/// - no room, which is internal;
/// - no password, portal link aside: credentials are read out by the front desk.
///
/// The practitioner's name stays: a patient needs to know who they are seeing, and the
/// practitioner is not the patient's health information.

export type Logistics = {
  firstName: string;
  /// Already formatted on the clinic's clock by the caller, e.g. "Tuesday, March 3 at 3:30 PM".
  when: string;
  practitionerName: string;
  clinicName: string;
  clinicPhone: string | null;
  /// Absolute, because a relative link means nothing in an inbox.
  portalUrl: string;
};

export type Rendered = { subject: string; body: string };

const WHEN_FORMAT = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: CLINIC_TIME_ZONE,
});

/// "Tuesday, March 3 at 3:30 PM" on the clinic's clock — the same wall clock the front desk
/// reads out, so a patient never has to think about time zones or about which day a late
/// appointment falls on.
export function formatWhen(instant: Date): string {
  return WHEN_FORMAT.format(instant).replace(/, (\d{1,2}:\d{2})/, ' at $1');
}

function signOff(logistics: Logistics): string {
  const phone = logistics.clinicPhone
    ? `Need to change something? Call us on ${logistics.clinicPhone}.`
    : 'Need to change something? Call the clinic and we will sort it out.';
  return `${phone}\n\n${logistics.clinicName}`;
}

function lines(...parts: string[]): string {
  return parts.filter((part) => part !== '').join('\n\n');
}

export function appointmentBooked(logistics: Logistics): Rendered {
  return {
    subject: `Your visit is booked — ${logistics.when}`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `Your visit with ${logistics.practitionerName} is booked for ${logistics.when}.`,
      `Please arrive a few minutes early. If this is your first visit, there is paperwork to fill in when you get here, and it is quicker on the tablet than on paper.`,
      `You can see your upcoming visits at ${logistics.portalUrl}`,
      signOff(logistics),
    ),
  };
}

/// Sent when the clinic confirms website requests by hand: the time is held, but nobody should
/// read "booked" into it until the front desk has looked.
export function appointmentRequested(logistics: Logistics): Rendered {
  return {
    subject: `We have your request — ${logistics.when}`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `Thank you for asking for ${logistics.when}. We are holding that time for you, and the front desk will confirm it shortly.`,
      `You do not need to do anything until you hear from us.`,
      signOff(logistics),
    ),
  };
}

export function appointmentConfirmed(logistics: Logistics): Rendered {
  return {
    subject: `Your visit is confirmed — ${logistics.when}`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `Your visit with ${logistics.practitionerName} on ${logistics.when} is confirmed.`,
      `You can see your upcoming visits at ${logistics.portalUrl}`,
      signOff(logistics),
    ),
  };
}

export function appointmentRescheduled(logistics: Logistics & { previously: string }): Rendered {
  return {
    subject: `Your visit has moved — now ${logistics.when}`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `Your visit with ${logistics.practitionerName} has moved from ${logistics.previously} to ${logistics.when}.`,
      `Nothing else has changed, and there is nothing you need to do.`,
      signOff(logistics),
    ),
  };
}

export function appointmentCancelled(logistics: Logistics): Rendered {
  return {
    subject: `Your visit on ${logistics.when} is cancelled`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `Your visit with ${logistics.practitionerName} on ${logistics.when} is cancelled.`,
      `Book another time whenever you are ready at ${logistics.portalUrl}`,
      signOff(logistics),
    ),
  };
}

export function appointmentReminder(logistics: Logistics): Rendered {
  return {
    subject: `Reminder: your visit ${logistics.when}`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `This is a reminder of your visit with ${logistics.practitionerName} on ${logistics.when}.`,
      `If you cannot make it, let us know as early as you can so somebody else can take the time.`,
      signOff(logistics),
    ),
  };
}

/// The one email that carries a credential. It is single-use — the account cannot be used
/// without changing it — and the alternative is the front desk reading a password down the
/// phone, which is not better.
export function portalInvite(logistics: {
  firstName: string;
  email: string;
  temporaryPassword: string;
  clinicName: string;
  clinicPhone: string | null;
  loginUrl: string;
}): Rendered {
  return {
    subject: `Your ${logistics.clinicName} patient login`,
    body: lines(
      `Hello ${logistics.firstName},`,
      `You can now book visits and fill in your paperwork online at ${logistics.loginUrl}`,
      `Sign in with ${logistics.email} and this one-time password: ${logistics.temporaryPassword}`,
      `You will be asked to choose your own password straight away, and this one stops working once you do. If you did not expect this email, ignore it${
        logistics.clinicPhone ? ` or call us on ${logistics.clinicPhone}` : ''
      }.`,
      logistics.clinicName,
    ),
  };
}

/// Staff accounts. Same single-use rule, plus the authenticator enrollment that every staff
/// login is forced through.
export function staffInvite(logistics: {
  name: string;
  email: string;
  temporaryPassword: string;
  clinicName: string;
  loginUrl: string;
}): Rendered {
  return {
    subject: `Your ${logistics.clinicName} staff account`,
    body: lines(
      `Hello ${logistics.name},`,
      `An account has been created for you at ${logistics.loginUrl}`,
      `Sign in with ${logistics.email} and this one-time password: ${logistics.temporaryPassword}`,
      `You will be asked to set up an authenticator app and choose your own password before you can do anything else. Have your phone with you.`,
      logistics.clinicName,
    ),
  };
}
