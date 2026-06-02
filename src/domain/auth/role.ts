/**
 * Auth role helper.
 *
 * Resolves a user's effective role for the Myco store admin surface.
 * Super admins are configured via the SUPER_ADMIN_EMAILS env var
 * (comma-separated). Everyone else defaults to partner_admin.
 */

export type UserRole = "super_admin" | "partner_admin";

export async function getUserRole(email: string): Promise<UserRole> {
  const superAdmins = (process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return superAdmins.includes(email.toLowerCase()) ? "super_admin" : "partner_admin";
}
