import { describe, expect, it } from 'vitest';
import { passwordPolicyError } from './password';

describe('password policy', () => {
  it.each(['Minnekyda-dev-1', 'CorrectHorse9Battery', 'aA1bbbbbbbbb'])(
    'accepts %s',
    (password) => {
      expect(passwordPolicyError(password)).toBeNull();
    },
  );

  it.each([
    ['short', 'Short1aaaa'],
    ['no upper case', 'minnekyda-dev-1'],
    ['no lower case', 'MINNEKYDA-DEV-1'],
    ['no number', 'Minnekyda-clinic'],
    ['empty', ''],
  ])('rejects a password with %s', (_label, password) => {
    expect(passwordPolicyError(password)).not.toBeNull();
  });
});
