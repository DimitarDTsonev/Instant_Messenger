/**
 * Client-side password complexity validation.
 *
 * Mirrors the same rules enforced by the backend's auth.service.ts so the user
 * gets instant feedback in the UI before a network round-trip is made.
 *
 * Used by: LoginPage.tsx (register form), ResetPasswordPage.tsx.
 */

/**
 * Checks a plain-text password against the application's complexity rules.
 *
 * Rules (same as backend):
 *  - At least 6 characters
 *  - At least one uppercase letter (A–Z)
 *  - At least one digit (0–9)
 *  - At least one special character (anything that is not A–Z, a–z, 0–9)
 *
 * @param password - Plain-text password string to validate.
 * @returns        A human-readable error message if invalid, or `null` if valid.
 *
 * @example
 * validatePassword("abc")          // → "Password must be at least 6 characters"
 * validatePassword("abcdef1!")     // → "Password must contain at least one uppercase letter"
 * validatePassword("Abcdef1!")     // → null  (passes all checks)
 */
export function validatePassword(password: string): string | null {
  if (password.length < 6)             return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password))         return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))         return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))  return "Password must contain at least one special character";
  return null;
}
