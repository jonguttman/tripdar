/**
 * NextAuth Configuration
 *
 * Handles authentication for the admin panel using GitHub OAuth.
 */

import { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { isAuthorizedEmail } from "./whitelist";

export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Only allow whitelisted emails
      const email = user.email || "";
      const isAllowed = isAuthorizedEmail(email);

      if (!isAllowed) {
        console.log(`[Auth] Denied sign-in for: ${email}`);
      }

      return isAllowed;
    },
    async session({ session }) {
      // Session includes user email for authorization checks
      return session;
    },
  },
  pages: {
    signIn: "/admin/strains",
    error: "/admin/strains",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
