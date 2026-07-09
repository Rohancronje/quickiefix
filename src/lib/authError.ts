/**
 * Turn raw Firebase Auth errors into friendly, on-brand messages.
 * Firebase throws things like "Firebase: Error (auth/invalid-credential)." —
 * never show that to a user. Map the common codes; fall back to a clean generic.
 */
const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'That doesn’t look like a valid email address.',
  'auth/user-disabled': 'This account has been disabled. Contact support.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Please choose a password with at least 6 characters.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error — check your connection and try again.',
  'auth/operation-not-allowed': 'Sign-in is temporarily unavailable. Please try again later.',
};

export function friendlyAuthError(e: unknown): string {
  const code: string | undefined =
    (e as { code?: string })?.code ??
    // Some SDKs only put the code in the message string.
    (typeof (e as { message?: string })?.message === 'string'
      ? (e as { message: string }).message.match(/auth\/[a-z-]+/)?.[0]
      : undefined);
  if (code && MESSAGES[code]) return MESSAGES[code];
  // Already-friendly errors (thrown by our own code) pass through unchanged.
  const msg = (e as { message?: string })?.message;
  if (msg && !msg.startsWith('Firebase:') && !msg.includes('auth/')) return msg;
  return 'Something went wrong. Please try again.';
}
