import crypto from 'node:crypto';

const WORDS = [
  'cedar',
  'willow',
  'ginger',
  'lotus',
  'birch',
  'peony',
  'quince',
  'sage',
  'juniper',
  'mulberry',
  'poplar',
  'aster',
];

/// Readable enough to say out loud, and it satisfies the password policy on its own. Always
/// paired with `mustChangePassword`, so it is never the password an account keeps.
export function temporaryPassword(): string {
  const pick = () => WORDS[crypto.randomInt(WORDS.length)];
  const word = pick();
  return `${word[0].toUpperCase()}${word.slice(1)}-${pick()}-${crypto.randomInt(10, 100)}`;
}
