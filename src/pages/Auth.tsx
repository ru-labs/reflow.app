import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, validateEmail, validatePassword } from '../lib/validation';
import { ChevronLeft } from '../components/icons/ChevronLeft';
import { GoogleMark } from '../components/icons/GoogleMark';
import { GithubMark } from '../components/icons/GithubMark';
import { BorderGlow } from '../components/BorderGlow';

interface AuthProps {
  onBack: () => void;
}

const KNOWN_ERRORS: Record<string, string> = {
  'Invalid login credentials': "that email or password doesn't match",
  'User already registered': 'looks like you already have an account — try signing in',
  'Email not confirmed': 'that email still needs confirming — check your inbox',
  'Password should be at least 6 characters': 'needs to be at least 6 characters',
  'Signup requires a valid password': 'that password looks too short — try a longer one',
  'Unable to validate email address: invalid format': "that doesn't look like a valid email",
};

type OAuthProvider = 'google' | 'github';

function fallbackError(mode: 'signin' | 'signup'): string {
  return mode === 'signin'
    ? "couldn't sign you in — check your details and try again"
    : "couldn't create your account — check your details and try again";
}

function toBrandVoice(message: string, mode: 'signin' | 'signup'): string {
  if (KNOWN_ERRORS[message]) return KNOWN_ERRORS[message];
  if (/rate limit|security purposes/i.test(message)) {
    return "too many tries — wait a moment and try again";
  }
  return fallbackError(mode);
}

export function Auth({ onBack }: AuthProps) {
  const { signIn, signUp, signInWithGoogle, signInWithGithub, supportsOAuth } = useAuth();
  const reducedMotion = useReducedMotion();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [oauthPending, setOauthPending] = useState<OAuthProvider | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emailResult = validateEmail(email);
    if (!emailResult.ok) {
      setError(emailResult.error);
      return;
    }
    const passwordResult = validatePassword(password, mode);
    if (!passwordResult.ok) {
      setError(passwordResult.error);
      return;
    }
    setSubmitting(true);
    if (mode === 'signin') {
      const { error } = await signIn(emailResult.value, password);
      setSubmitting(false);
      if (error) setError(toBrandVoice(error, mode));
      return;
    }
    const { error, confirmationSent } = await signUp(emailResult.value, password);
    setSubmitting(false);
    if (error) {
      setError(toBrandVoice(error, mode));
    } else if (confirmationSent) {
      setConfirmationSent(true);
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setOauthPending(provider);
    setError(null);
    const { error } = provider === 'google' ? await signInWithGoogle() : await signInWithGithub();
    if (error) {
      setOauthPending(null);
      setError(toBrandVoice(error, mode));
    }
    // On success the browser navigates away to the provider, so no need to
    // clear oauthPending here — it stays disabled until the redirect happens.
  }

  return (
    <div className="auth-shell">
      <button type="button" onClick={onBack} className="auth-back" aria-label="back">
        <ChevronLeft />
      </button>
      <div className="auth-frame">
        <BorderGlow borderRadius={24} glowRadius={28} edgeSensitivity={40}>
          <div className="auth-card">
            <h1 className="auth-wordmark">reflow</h1>

            {confirmationSent ? (
              <p className="auth-confirmation">check your email to confirm your account</p>
            ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <input
                type="email"
                placeholder="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                className="auth-input"
                maxLength={EMAIL_MAX_LENGTH}
                required
              />
              <input
                type="password"
                placeholder="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                className="auth-input"
                maxLength={PASSWORD_MAX_LENGTH}
                required
              />
              <AnimatePresence>
                {error && (
                  <motion.p
                    className="auth-error"
                    role="alert"
                    initial={reducedMotion ? false : { opacity: 0, height: 0, marginBottom: -10 }}
                    animate={{ opacity: 1, height: 'auto', marginBottom: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>
              <button type="submit" className="auth-submit" disabled={submitting}>
                {submitting ? (mode === 'signin' ? 'signing in…' : 'creating account…') : mode === 'signin' ? 'sign in' : 'sign up'}
              </button>
            </form>
            )}

            {!confirmationSent && supportsOAuth && (
              <>
                <div className="auth-divider" role="separator">
                  <span>or</span>
                </div>
                <div className="auth-oauth-group">
                  <button
                    type="button"
                    className="auth-oauth-button"
                    onClick={() => handleOAuth('google')}
                    disabled={oauthPending !== null}
                  >
                    <GoogleMark aria-hidden="true" />
                    {oauthPending === 'google' ? 'redirecting…' : 'continue with Google'}
                  </button>
                  <button
                    type="button"
                    className="auth-oauth-button"
                    onClick={() => handleOAuth('github')}
                    disabled={oauthPending !== null}
                  >
                    <GithubMark aria-hidden="true" />
                    {oauthPending === 'github' ? 'redirecting…' : 'continue with GitHub'}
                  </button>
                </div>
              </>
            )}

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setConfirmationSent(false);
                setError(null);
              }}
              className="auth-switch"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={mode}
                  initial={reducedMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'inline-block' }}
                >
                  {mode === 'signin' ? "don't have an account? sign up" : 'already have an account? sign in'}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </BorderGlow>
      </div>
    </div>
  );
}
