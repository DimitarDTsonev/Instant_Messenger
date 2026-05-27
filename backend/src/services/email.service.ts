const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM    = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const FRONTEND_URL   = process.env.FRONTEND_URL || "http://localhost:5173";

export async function sendPasswordResetEmail(to: string, username: string, rawToken: string): Promise<void> {
  const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

  if (RESEND_API_KEY) {
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
    // No email service configured — log to console (development / demo mode)
    console.log(`[PASSWORD RESET] token for ${username}: ${rawToken}`);
    console.log(`[PASSWORD RESET] reset link: ${resetLink}`);
  }
}
