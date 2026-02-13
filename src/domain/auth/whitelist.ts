/**
 * Admin Email Whitelist
 *
 * Controls which users can access the admin panel.
 */

// Whitelist from environment variable (comma-separated)
const WHITELIST = (process.env.ADMIN_EMAIL_WHITELIST || "")
  .split(",")
  .map(email => email.trim().toLowerCase())
  .filter(Boolean);

/**
 * Check if an email is authorized for admin access
 */
export function isAuthorizedEmail(email: string): boolean {
  if (!email) return false;
  return WHITELIST.includes(email.toLowerCase());
}

/**
 * Get all whitelisted emails (for debugging)
 */
export function getWhitelistedEmails(): string[] {
  return [...WHITELIST];
}
