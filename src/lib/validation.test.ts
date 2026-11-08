import { describe, expect, it } from 'vitest';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, TITLE_MAX_LENGTH, validateEmail, validatePassword, validateTitle } from './validation';

describe('validateTitle', () => {
  it('accepts a normal title', () => {
    expect(validateTitle('call the plumber')).toEqual({ ok: true, value: 'call the plumber' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateTitle('  hi  ')).toEqual({ ok: true, value: 'hi' });
  });

  it('rejects empty input', () => {
    expect(validateTitle('')).toEqual({ ok: false, error: 'give this task a name' });
  });

  it('rejects whitespace-only input', () => {
    expect(validateTitle('   ')).toEqual({ ok: false, error: 'give this task a name' });
  });

  it('strips control characters before checking emptiness', () => {
    expect(validateTitle('\x00\x01')).toEqual({ ok: false, error: 'give this task a name' });
  });

  it('rejects a title over the max length', () => {
    const long = 'a'.repeat(TITLE_MAX_LENGTH + 1);
    const result = validateTitle(long);
    expect(result.ok).toBe(false);
  });

  it('accepts a title exactly at the max length', () => {
    const max = 'a'.repeat(TITLE_MAX_LENGTH);
    expect(validateTitle(max)).toEqual({ ok: true, value: max });
  });
});

describe('validateEmail', () => {
  it('accepts a normal email', () => {
    expect(validateEmail('user@example.com')).toEqual({ ok: true, value: 'user@example.com' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateEmail('  user@example.com  ')).toEqual({ ok: true, value: 'user@example.com' });
  });

  it('rejects empty input', () => {
    expect(validateEmail('')).toEqual({ ok: false, error: 'enter your email' });
  });

  it('rejects input without an @', () => {
    expect(validateEmail('not-an-email').ok).toBe(false);
  });

  it('rejects input without a domain', () => {
    expect(validateEmail('user@localhost').ok).toBe(false);
  });

  it('rejects an email over the max length', () => {
    const long = `${'a'.repeat(EMAIL_MAX_LENGTH)}@example.com`;
    expect(validateEmail(long).ok).toBe(false);
  });
});

describe('validatePassword', () => {
  it('accepts a normal password on signin', () => {
    expect(validatePassword('hunter2', 'signin')).toEqual({ ok: true, value: undefined });
  });

  it('rejects empty input', () => {
    expect(validatePassword('', 'signin')).toEqual({ ok: false, error: 'enter your password' });
  });

  it('rejects a password over the max length', () => {
    const long = 'a'.repeat(PASSWORD_MAX_LENGTH + 1);
    expect(validatePassword(long, 'signin').ok).toBe(false);
  });

  it('rejects a short password on signup', () => {
    expect(validatePassword('abc', 'signup')).toEqual({ ok: false, error: 'needs to be at least 6 characters' });
  });

  it('allows a short password on signin (server is the source of truth there)', () => {
    expect(validatePassword('abc', 'signin')).toEqual({ ok: true, value: undefined });
  });
});
