import { Resend } from "resend";
import crypto from "crypto";

let client: Resend | null = null;

function resendClient(): Resend {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }

  return client;
}

export const DEFAULT_EMAIL_FROM_ADDRESS = "Tripdar <noreply@tripd.ar>";
export const DEFAULT_EMAIL_REPLY_TO_ADDRESS = "scottyclaw@gmail.com";

export interface SendEmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: "resend";
}

export function providerCredentialFingerprint(provider = "resend"): string {
  const credential = process.env.RESEND_API_KEY;
  if (!credential) throw new Error("RESEND_API_KEY is required for provider fingerprinting");
  return crypto
    .createHash("sha256")
    .update(`${provider}:${credential}`, "utf8")
    .digest("hex");
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const {
    to,
    cc,
    subject,
    html,
    text,
    from = DEFAULT_EMAIL_FROM_ADDRESS,
    replyTo = DEFAULT_EMAIL_REPLY_TO_ADDRESS,
    idempotencyKey,
  } = options;

  const { data, error } = await resendClient().emails.send(
    {
      from,
      to: Array.isArray(to) ? to : [to],
      ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
      subject,
      html,
      replyTo,
      ...(text ? { text } : {}),
    },
    idempotencyKey ? { idempotencyKey } : undefined
  );

  if (error) {
    console.error("[email] Failed to send email:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }

  if (!data?.id) throw new Error("Email send failed: missing provider message id");
  return { messageId: data.id, provider: "resend" };
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
