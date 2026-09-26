export const TITLE_MAX_LENGTH = 200;
export const TAG_MAX_LENGTH = 30;
export const TAGS_MAX_COUNT = 10;
export const EMAIL_MAX_LENGTH = 254; // RFC 5321 mailbox limit
export const PASSWORD_MAX_LENGTH = 72; // bcrypt truncates beyond this anyway
export const HOURS_MAX = 24; // mirrors tasks_hours_spent_range (0006)

type ValidationResult<T = void> = { ok: true; value: T } | { ok: false; error: string };

// eslint-disable-next-line no-control-regex -- intentionally stripping control characters
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function validateTitle(raw: string): ValidationResult<string> {
  const trimmed = raw.replace(CONTROL_CHARS, '').trim();
  if (!trimmed) return { ok: false, error: 'give this task a name' };
  if (trimmed.length > TITLE_MAX_LENGTH) {
    return { ok: false, error: `keep it under ${TITLE_MAX_LENGTH} characters` };
  }
  return { ok: true, value: trimmed };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: string): ValidationResult<string> {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'enter your email' };
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return { ok: false, error: "that email's too long" };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { ok: false, error: "that doesn't look like a valid email" };
  }
  return { ok: true, value: trimmed };
}

export function validatePassword(raw: string, mode: 'signin' | 'signup'): ValidationResult {
  if (!raw) return { ok: false, error: 'enter your password' };
  if (raw.length > PASSWORD_MAX_LENGTH) {
    return { ok: false, error: `keep it under ${PASSWORD_MAX_LENGTH} characters` };
  }
  if (mode === 'signup' && raw.length < 6) {
    return { ok: false, error: 'needs to be at least 6 characters' };
  }
  return { ok: true, value: undefined };
}
