/**
 * KEWL-2335 — /staff section layout.
 *
 * Exists solely to load the section stylesheet. The root layout imports no CSS, so
 * without this the review surface renders as unstyled HTML on a phone.
 */

import "./staff.css";

/**
 * Light surface on purpose: this is a shop-floor tool read on a phone under bright
 * light, and the root <body> is dark, so the section must set its own background or
 * the dark-on-dark text is unreadable.
 */
export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-neutral-50 text-neutral-900">{children}</div>;
}
