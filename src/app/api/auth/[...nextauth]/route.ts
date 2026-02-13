/**
 * NextAuth Route Handler
 *
 * Handles authentication requests for the admin panel.
 */

import NextAuth from "next-auth";
import { authOptions } from "@/domain/auth/config";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
