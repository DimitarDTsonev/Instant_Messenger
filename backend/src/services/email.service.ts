/**
 * Email service — sends transactional emails via the Resend API.
 *
 * When `RESEND_API_KEY` is not set (development / demo mode) the function
 * falls back to logging the reset link to the console so developers can still
 * test the password-reset flow without configuring an email provider.
 *
 * The Resend SDK is imported dynamically so the module can load without the
 * optional `resend` npm package when running tests or minimal installs.
 *
 * Imported by: auth.service.ts (forgotPassword).
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const FRONTEND_URL   = process.env.FRONTEND_URL || "http://localhost:5173";

/**
 * Sends a password-reset email with a single-use link to the given address.
 *
 * The link format is: `${FRONTEND_URL}/reset-password?token=${rawToken}`.
 * The token expires after 1 hour (enforced by the database, not this function).
 *
 * @param to        - Recipient email address.
 * @param username  - Recipient's display name (used in the greeting).
 * @param rawToken  - The un-hashed 32-byte hex token to embed in the link.
 *                    This is the value from `crypto.randomBytes(32)`.
 */
export async function sendPasswordResetEmail(to: string, username: string, rawToken: string): Promise<void> {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

  if (RESEND_API_KEY) {
    // Production path: use the Resend API to send a real email
    const { Resend } = await import("resend");
    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
      from: RESEND_FROM,
      to,
      subject: "Reset your password",
      text: `Hi ${username},\n\nClick the link below to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you did not request a password reset, you can safely ignore this email.`,
      html: `<p>Hi <strong>${username}</strong>,</p>
             <p>Click the link below to reset your password:</p>
             <p><a href="${resetLink}">${resetLink}</a></p>
             <p>This link expires in 1 hour.</p>
             <p>If you did not request a password reset, you can safely ignore this email.</p>`,
    });
  } else {
    // Development / demo fallback: log to console so the flow can still be tested
    console.log(`[PASSWORD RESET] token for ${username}: ${rawToken}`);
    console.log(`[PASSWORD RESET] reset link: ${resetLink}`);
  }
}
