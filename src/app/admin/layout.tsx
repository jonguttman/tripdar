"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/myco", label: "Myco Store", icon: "spark" },
  { href: "/admin/strains", label: "Strains", icon: "leaf" },
  { href: "/admin/collections", label: "Collections", icon: "folder" },
  { href: "/admin/reviews", label: "Reviews", icon: "star" },
  { href: "/admin/ratings", label: "Ratings", icon: "award" },
  { href: "/admin/reports", label: "Trip Reports", icon: "file" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/partners", label: "Partners", icon: "users" },
];

const icons: Record<string, JSX.Element> = {
  grid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  leaf: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.5 0 3-.3 4.3-.9" />
      <path d="M12 2c3 3 5 7.5 5 12 0 1.5-.3 3-.9 4.3" />
      <path d="M12 2v20" />
    </svg>
  ),
  folder: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  ),
  star: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  ),
  award: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="7" />
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" />
    </svg>
  ),
  file: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  spark: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </svg>
  ),
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setEmailLoading(true);
    setEmailError("");
    const result = await signIn("email", {
      email: email.trim(),
      redirect: false,
      callbackUrl: pathname || "/admin/myco",
    });
    setEmailLoading(false);
    if (result?.error) {
      setEmailError("Could not send magic link. Check that your email is authorized.");
    } else {
      setEmailSent(true);
    }
  }

  // Loading state
  if (status === "loading") {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <div style={styles.logo}>Tripdar</div>
          <h1 style={styles.authTitle}>Admin Dashboard</h1>

          {emailSent ? (
            <div style={styles.emailSentBox}>
              <p style={styles.emailSentText}>
                Check your inbox — a sign-in link has been sent to <strong>{email}</strong>.
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleEmailSignIn} style={styles.emailForm}>
                <p style={styles.authSubtitle}>Enter your email to receive a sign-in link.</p>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  style={styles.emailInput}
                />
                {emailError && <p style={styles.emailError}>{emailError}</p>}
                <button type="submit" disabled={emailLoading} style={styles.emailButton}>
                  {emailLoading ? "Sending..." : "Send sign-in link"}
                </button>
              </form>

              <div style={styles.divider}>
                <span style={styles.dividerText}>or</span>
              </div>

              <p style={styles.authSubtitle}>Sign in with your GitHub account.</p>
              <button onClick={() => signIn("github")} style={styles.authButton}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: "8px" }}>
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                Sign in with GitHub
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <Link href="/admin" style={styles.logoLink}>
            <span style={styles.logo}>Tripdar</span>
          </Link>
          <span style={styles.adminBadge}>Admin</span>
        </div>

        <nav style={styles.nav}>
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  ...styles.navItem,
                  ...(isActive ? styles.navItemActive : {}),
                }}
              >
                <span style={styles.navIcon}>{icons[item.icon]}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.userInfo}>
            {session.user?.image && (
              <img
                src={session.user.image}
                alt=""
                style={styles.userAvatar}
              />
            )}
            <div style={styles.userDetails}>
              <div style={styles.userName}>{session.user?.name}</div>
              <div style={styles.userEmail}>{session.user?.email}</div>
            </div>
          </div>
          <button onClick={() => signOut()} style={styles.signOutButton}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={styles.main}>{children}</main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  sidebar: {
    width: "260px",
    background: "#1f2937",
    color: "white",
    display: "flex",
    flexDirection: "column",
    position: "fixed",
    top: 0,
    left: 0,
    bottom: 0,
    zIndex: 100,
  },
  sidebarHeader: {
    padding: "1.5rem",
    borderBottom: "1px solid #374151",
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  logoLink: {
    textDecoration: "none",
  },
  logo: {
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#a78bfa",
  },
  adminBadge: {
    fontSize: "0.625rem",
    fontWeight: 600,
    padding: "0.25rem 0.5rem",
    background: "#374151",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "#9ca3af",
  },
  nav: {
    flex: 1,
    padding: "1rem 0",
    overflowY: "auto",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1.5rem",
    color: "#9ca3af",
    textDecoration: "none",
    fontSize: "0.875rem",
    fontWeight: 500,
    transition: "all 0.15s ease",
  },
  navItemActive: {
    color: "white",
    background: "#374151",
    borderRight: "3px solid #a78bfa",
  },
  navIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
  },
  sidebarFooter: {
    padding: "1rem 1.5rem",
    borderTop: "1px solid #374151",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.75rem",
  },
  userAvatar: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "#374151",
  },
  userDetails: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "white",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  userEmail: {
    fontSize: "0.75rem",
    color: "#9ca3af",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  signOutButton: {
    width: "100%",
    padding: "0.5rem",
    background: "transparent",
    border: "1px solid #4b5563",
    borderRadius: "6px",
    color: "#9ca3af",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  main: {
    flex: 1,
    marginLeft: "260px",
    background: "#f9fafb",
    minHeight: "100vh",
  },
  loadingContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    color: "#6b7280",
    gap: "1rem",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid #e5e7eb",
    borderTopColor: "#6d28d9",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
  },
  authContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1f2937 0%, #111827 100%)",
  },
  authCard: {
    background: "white",
    borderRadius: "16px",
    padding: "3rem",
    textAlign: "center",
    maxWidth: "400px",
    width: "90%",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
  },
  authTitle: {
    fontSize: "1.5rem",
    fontWeight: 600,
    margin: "1rem 0 0.5rem",
    color: "#111827",
  },
  authSubtitle: {
    fontSize: "0.875rem",
    color: "#6b7280",
    margin: "0 0 1.5rem",
  },
  authButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0.75rem 1.5rem",
    background: "#24292f",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  emailForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  emailInput: {
    padding: "0.75rem 1rem",
    border: "1px solid #d1d5db",
    borderRadius: "8px",
    fontSize: "1rem",
    color: "#111827",
    width: "100%",
  },
  emailButton: {
    padding: "0.75rem 1.5rem",
    background: "#2563eb",
    color: "white",
    border: "none",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    width: "100%",
  },
  emailError: {
    color: "#dc2626",
    fontSize: "0.85rem",
    margin: 0,
  },
  emailSentBox: {
    background: "#ecfdf5",
    border: "1px solid #a7f3d0",
    borderRadius: "8px",
    padding: "1.25rem",
  },
  emailSentText: {
    color: "#065f46",
    margin: 0,
    lineHeight: 1.5,
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    margin: "1rem 0",
  },
  dividerText: {
    color: "#9ca3af",
    fontSize: "0.85rem",
    padding: "0 0.25rem",
    background: "white",
    position: "relative" as const,
    zIndex: 1,
    margin: "0 auto",
  },
};
