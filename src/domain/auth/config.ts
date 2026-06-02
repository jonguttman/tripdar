/**
 * NextAuth Configuration
 *
 * Handles authentication for the admin panel using GitHub OAuth (Jon) and
 * email magic link (staff — requires RESEND_API_KEY in Vercel env).
 * Access is gated by ADMIN_EMAIL_WHITELIST in all cases.
 */

import { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { isAuthorizedEmail } from "./whitelist";

async function sendMagicLink({
  identifier,
  url,
}: {
  identifier: string;
  url: string;
  provider: { from: string };
  theme: unknown;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Tripdar Admin <noreply@tripd.ar>";

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured — cannot send magic link");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: identifier,
      subject: "Sign in to Tripdar Admin",
      html: `<p>Click the link below to sign in to Tripdar Admin:</p>
<p><a href="${url}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Sign in</a></p>
<p>This link expires in 24 hours. If you did not request this, ignore this email.</p>`,
      text: `Sign in to Tripdar Admin\n\n${url}\n\nThis link expires in 24 hours.`,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Failed to send magic link: ${error}`);
  }
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    EmailProvider({
      from: process.env.EMAIL_FROM ?? "noreply@tripd.ar",
      sendVerificationRequest: sendMagicLink,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      const email = user.email || "";
      const isAllowed = isAuthorizedEmail(email);

      if (!isAllowed) {
        console.log(`[Auth] Denied sign-in for: ${email}`);
      }

      return isAllowed;
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/admin",
    error: "/admin",
  },
  session: {
    strategy: "database",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
