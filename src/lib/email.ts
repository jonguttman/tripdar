import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = "Tripdar <noreply@tripd.ar>";
const REPLY_TO_ADDRESS = "scottyclaw@gmail.com";

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const { to, subject, html, text, from = FROM_ADDRESS, replyTo = REPLY_TO_ADDRESS } = options;

  const { data, error } = await resend.emails.send({
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    replyTo,
    ...(text ? { text } : {}),
  });

  if (error) {
    console.error("[email] Failed to send email:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  return data;
}

export async function sendMagicLink(email: string, url: string) {
  return sendEmail({
    to: email,
    subject: "Sign in to Tripdar",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom: 8px;">Sign in to Tripdar</h2>
        <p style="color: #555; margin-bottom: 24px;">
          Click the button below to sign in. This link expires in 10 minutes and can only be used once.
        </p>
        <a href="${url}"
           style="display: inline-block; background: #7c3aed; color: white;
                  padding: 12px 24px; border-radius: 6px; text-decoration: none;
                  font-weight: 600;">
          Sign in to Tripdar
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
    text: `Sign in to Tripdar\n\nClick this link to sign in (expires in 10 minutes):\n${url}\n\nIf you didn't request this, you can safely ignore this email.`,
  });
}
