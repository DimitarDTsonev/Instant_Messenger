export function validatePassword(password: string): string | null {
  if (password.length < 6)             return "Password must be at least 6 characters";
  if (!/[A-Z]/.test(password))         return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(password))         return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(password))  return "Password must contain at least one special character";
  return null;
}
