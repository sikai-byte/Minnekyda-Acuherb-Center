import { describe, expect, it } from 'vitest';
import {
  appointmentBooked,
  appointmentCancelled,
  appointmentConfirmed,
  appointmentReminder,
  appointmentRequested,
  appointmentRescheduled,
  formatWhen,
  portalInvite,
  staffInvite,
  type Logistics,
  type Rendered,
} from './templates';

/// Email is the only place the clinic's data leaves a system it controls, so what the templates
/// may say is asserted rather than intended. The markers below stand in for everything a chart
/// holds that an inbox must never see; if a future template starts interpolating an appointment
/// type, a note, or an intake answer, one of these fails.

const LOGISTICS: Logistics = {
  firstName: 'Ada',
  when: 'Tuesday, March 17 at 3:30 PM',
  practitionerName: 'Dr Rivera',
  clinicName: 'Minnekyda Acuherb Center',
  clinicPhone: '(555) 010-2020',
  portalUrl: 'https://clinic.example/portal/appointments',
};

const CLINICAL_WORDS = [
  'symptom',
  'diagnosis',
  'diagnos',
  'pain',
  'insomnia',
  'fertility',
  'formula',
  'acupuncture',
  'treatment plan',
  'consultation',
  'tongue',
  'pulse',
  'complaint',
  'condition',
  'medication',
  'pregnan',
];

const ALL: Rendered[] = [
  appointmentBooked(LOGISTICS),
  appointmentRequested(LOGISTICS),
  appointmentConfirmed(LOGISTICS),
  appointmentRescheduled({ ...LOGISTICS, previously: 'Monday, March 16 at 9:00 AM' }),
  appointmentCancelled(LOGISTICS),
  appointmentReminder(LOGISTICS),
];

describe('appointment emails carry logistics only', () => {
  it.each(ALL.map((rendered) => [rendered.subject, rendered] as const))(
    'says nothing clinical: %s',
    (_subject, rendered) => {
      const text = `${rendered.subject}\n${rendered.body}`.toLowerCase();
      for (const word of CLINICAL_WORDS) {
        expect(text, `"${word}" reached an email`).not.toContain(word);
      }
    },
  );

  it('never names the appointment type, which the clinic can rename to anything', () => {
    /// The type is not even a parameter, so a template cannot leak one by accident.
    expect(Object.keys(LOGISTICS)).not.toContain('appointmentType');
    for (const rendered of ALL) {
      expect(rendered.body).not.toContain('60 minutes');
      expect(rendered.body).not.toContain('75 minutes');
    }
  });

  it('never names the room, which is internal', () => {
    for (const rendered of ALL) {
      expect(rendered.body.toLowerCase()).not.toContain('room');
    }
  });

  it('gives the patient the time, the practitioner and a way to reach the clinic', () => {
    const booked = appointmentBooked(LOGISTICS);
    expect(booked.subject).toContain('Tuesday, March 17 at 3:30 PM');
    expect(booked.body).toContain('Dr Rivera');
    expect(booked.body).toContain('(555) 010-2020');
    expect(booked.body).toContain('https://clinic.example/portal/appointments');
  });

  it('falls back to "call the clinic" when no phone number is configured', () => {
    const rendered = appointmentBooked({ ...LOGISTICS, clinicPhone: null });
    expect(rendered.body).toContain('Call the clinic');
    expect(rendered.body).not.toContain('null');
  });

  it('tells a website visitor their time is held, not booked, when staff confirm by hand', () => {
    const rendered = appointmentRequested(LOGISTICS);
    expect(rendered.subject).not.toContain('booked');
    expect(rendered.subject).not.toContain('confirmed');
    expect(rendered.body).toContain('holding that time');
  });

  it('names both the old time and the new one on a move', () => {
    const rendered = appointmentRescheduled({
      ...LOGISTICS,
      previously: 'Monday, March 16 at 9:00 AM',
    });
    expect(rendered.body).toContain('Monday, March 16 at 9:00 AM');
    expect(rendered.body).toContain('Tuesday, March 17 at 3:30 PM');
  });
});

describe('invitations', () => {
  const INVITE = {
    firstName: 'Ada',
    name: 'Ada Lovelace',
    email: 'ada@example.test',
    temporaryPassword: 'Quiet-Meadow-4821',
    clinicName: 'Minnekyda Acuherb Center',
    clinicPhone: null,
    loginUrl: 'https://clinic.example/login',
  };

  it('carries the one-time password and says it stops working', () => {
    const rendered = portalInvite(INVITE);
    expect(rendered.body).toContain('Quiet-Meadow-4821');
    expect(rendered.body).toContain('stops working');
    expect(rendered.body).toContain('https://clinic.example/login');
  });

  it('tells new staff to bring their phone for the authenticator', () => {
    const rendered = staffInvite(INVITE);
    expect(rendered.body).toContain('authenticator app');
    expect(rendered.body).toContain('Quiet-Meadow-4821');
  });

  it('puts nothing about the patient beyond their name in a portal invitation', () => {
    const text = portalInvite(INVITE).body.toLowerCase();
    for (const word of CLINICAL_WORDS) {
      expect(text, `"${word}" reached an invitation`).not.toContain(word);
    }
  });
});

describe('formatWhen', () => {
  it('reads a time on the clinic clock, not the server clock', () => {
    /// 20:30Z in central daylight time is 3:30pm in Chicago. The server may be anywhere.
    expect(formatWhen(new Date('2026-03-17T20:30:00.000Z'))).toBe('Tuesday, March 17 at 3:30 PM');
  });

  it('keeps a late appointment on its own clinic day', () => {
    /// 00:30Z on the 18th is 7:30pm on the 17th in Chicago — the day a patient would say.
    expect(formatWhen(new Date('2026-03-18T00:30:00.000Z'))).toContain('March 17');
  });
});
