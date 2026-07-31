"use client";

import "./admin.css";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Alert,
  Button,
  Icon,
  Input,
  Spinner,
  cn,
  type IconName,
} from "@/components/admin";

const navItems: { href: string; label: string; icon: IconName }[] = [
  { href: "/admin", label: "Dashboard", icon: "grid" },
  { href: "/admin/myco", label: "Myco Store", icon: "spark" },
  { href: "/admin/myco/brand-links", label: "Brand Links", icon: "key" },
  { href: "/admin/strains", label: "Strains", icon: "leaf" },
  { href: "/admin/collections", label: "Collections", icon: "folder" },
  { href: "/admin/reviews", label: "Reviews", icon: "star" },
  { href: "/admin/ratings", label: "Ratings", icon: "award" },
  { href: "/admin/reports", label: "Trip Reports", icon: "file" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/partners", label: "Partners", icon: "users" },
];

/* High-traffic sections pinned to the mobile bottom tab bar. */
/* Selected by href, not index — inserting a nav entry must not silently repoint these. */
const tabBarHrefs = ["/admin", "/admin/myco", "/admin/reviews", "/admin/reports"];
const tabBarItems = tabBarHrefs.map(
  (href) => navItems.find((item) => item.href === href)!
);

/**
 * Longest match wins. `/admin/myco/brand-links` is its own nav entry, so a plain
 * prefix test would light it up *and* `/admin/myco` at the same time.
 */
function isActiveRoute(pathname: string, href: string): boolean {
  const matches = navItems
    .map((item) => item.href)
    .filter(
      (candidate) =>
        pathname === candidate ||
        (candidate !== "/admin" && pathname.startsWith(`${candidate}/`))
    );
  if (matches.length === 0) return false;
  const deepest = matches.reduce((best, candidate) =>
    candidate.length > best.length ? candidate : best
  );
  return href === deepest;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState("");

  // Close the drawer whenever navigation happens.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  async function handlePasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!pwEmail.trim() || !pwPassword) return;
    setPwLoading(true);
    setPwError("");
    try {
      const res = await fetch("/api/admin/password-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pwEmail.trim(), password: pwPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data.error || "Sign-in failed");
        setPwLoading(false);
        return;
      }
      window.location.href = data.redirect || "/admin/myco";
    } catch (err) {
      setPwError("Network error — try again");
      setPwLoading(false);
    }
  }

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
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bone-100 font-sans text-bark-400">
        <Spinner />
        <p>Loading...</p>
      </div>
    );
  }

  // Not authenticated
  if (!session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-bark-900 via-bark-800 to-moss-900 px-4 py-8 font-sans">
        <div className="w-full max-w-md rounded-2xl bg-bone-50 p-6 shadow-2xl sm:p-10">
          <div className="text-center">
            <div className="font-display text-3xl text-moss-700">Tripdar</div>
            <h1 className="mt-2 mb-6 text-lg font-semibold text-bark-800">
              Admin Dashboard
            </h1>
          </div>

          {emailSent ? (
            <Alert tone="success">
              Check your inbox — a sign-in link has been sent to{" "}
              <strong>{email}</strong>.
            </Alert>
          ) : (
            <>
              <form onSubmit={handlePasswordSignIn} className="flex flex-col gap-3">
                <p className="text-sm text-bark-400">
                  Sign in with email and password.
                </p>
                <Input
                  type="email"
                  value={pwEmail}
                  onChange={(e) => setPwEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                />
                <Input
                  type="password"
                  value={pwPassword}
                  onChange={(e) => setPwPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
                {pwError && <p className="text-sm text-clay-600">{pwError}</p>}
                <Button type="submit" loading={pwLoading} full>
                  {pwLoading ? "Signing in..." : "Sign in"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-sm text-bark-300">
                <span className="h-px flex-1 bg-bone-300" />
                or
                <span className="h-px flex-1 bg-bone-300" />
              </div>

              <form onSubmit={handleEmailSignIn} className="flex flex-col gap-3">
                <p className="text-sm text-bark-400">
                  Enter your email to receive a sign-in link.
                </p>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                />
                {emailError && (
                  <p className="text-sm text-clay-600">{emailError}</p>
                )}
                <Button
                  type="submit"
                  variant="secondary"
                  loading={emailLoading}
                  full
                >
                  {emailLoading ? "Sending..." : "Send sign-in link"}
                </Button>
              </form>

              <div className="my-5 flex items-center gap-3 text-sm text-bark-300">
                <span className="h-px flex-1 bg-bone-300" />
                or
                <span className="h-px flex-1 bg-bone-300" />
              </div>

              <button
                onClick={() => signIn("github")}
                className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-bark-900 text-sm font-medium text-bone-50 transition-colors hover:bg-bark-800"
              >
                <Icon name="github" size={20} />
                Sign in with GitHub
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  const navLinks = (variant: "sidebar" | "drawer") =>
    navItems.map((item) => {
      const active = isActiveRoute(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
            variant === "sidebar"
              ? active
                ? "bg-moss-800/60 text-moss-100"
                : "text-bark-300 hover:bg-bark-800 hover:text-bone-100"
              : active
                ? "bg-moss-100 text-moss-800"
                : "text-bark-600 hover:bg-bone-200/60"
          )}
        >
          <Icon name={item.icon} size={20} className="shrink-0" />
          {item.label}
        </Link>
      );
    });

  const userBlock = (dark: boolean) => (
    <div className="flex items-center gap-3">
      {session.user?.image ? (
        <img
          src={session.user.image}
          alt=""
          className="size-9 shrink-0 rounded-full bg-bark-700"
        />
      ) : (
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            dark ? "bg-moss-800 text-moss-200" : "bg-moss-100 text-moss-700"
          )}
        >
          {(session.user?.name || session.user?.email || "?")
            .charAt(0)
            .toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm font-medium",
            dark ? "text-bone-100" : "text-bark-800"
          )}
        >
          {session.user?.name}
        </div>
        <div
          className={cn(
            "truncate text-xs",
            dark ? "text-bark-300" : "text-bark-400"
          )}
        >
          {session.user?.email}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bone-100 font-sans text-bark-800">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col bg-bark-900 md:flex">
        <div className="flex items-center gap-3 border-b border-bark-700/60 px-5 py-5">
          <Link href="/admin" className="font-display text-2xl text-moss-300">
            Tripdar
          </Link>
          <span className="rounded bg-bark-800 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wider text-bark-300">
            Admin
          </span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {navLinks("sidebar")}
        </nav>
        <div className="space-y-3 border-t border-bark-700/60 p-4">
          {userBlock(true)}
          <button
            onClick={() => signOut()}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-bark-700 text-xs font-medium text-bark-300 transition-colors hover:bg-bark-800 hover:text-bone-100"
          >
            <Icon name="logout" size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex min-h-14 items-center justify-between gap-3 border-b border-bone-300 bg-bone-100/90 px-4 backdrop-blur md:hidden">
        <Link href="/admin" className="flex items-center gap-2">
          <span className="font-display text-xl text-moss-700">Tripdar</span>
          <span className="rounded bg-bone-200 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-bark-500">
            Admin
          </span>
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-bark-600 hover:bg-bone-200/60"
        >
          <Icon name="menu" size={22} />
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-bark-900/50 backdrop-blur-[2px] animate-fade-in md:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute inset-y-0 right-0 flex w-[85vw] max-w-xs flex-col bg-bone-50 shadow-2xl animate-drawer-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-bone-300 px-4 py-3">
              <span className="font-display text-xl text-moss-700">Tripdar</span>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-lg text-bark-500 hover:bg-bone-200/60"
              >
                <Icon name="x" size={22} />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {navLinks("drawer")}
            </nav>
            <div className="space-y-3 border-t border-bone-300 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {userBlock(false)}
              <button
                onClick={() => signOut()}
                className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-bone-300 text-sm font-medium text-bark-600 transition-colors hover:bg-bone-200/60"
              >
                <Icon name="logout" size={16} />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="min-h-dvh pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-64">
        {children}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-bone-300 bg-bone-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {tabBarItems.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[0.625rem] font-medium",
                active ? "text-moss-700" : "text-bark-400"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active && "bg-moss-100"
                )}
              >
                <Icon name={item.icon} size={20} />
              </span>
              {item.label === "Trip Reports" ? "Reports" : item.label === "Myco Store" ? "Myco" : item.label}
            </Link>
          );
        })}
        <button
          onClick={() => setDrawerOpen(true)}
          className={cn(
            "flex min-h-16 flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-[0.625rem] font-medium",
            drawerOpen ? "text-moss-700" : "text-bark-400"
          )}
        >
          <span className="flex h-7 w-12 items-center justify-center rounded-full">
            <Icon name="dots" size={20} />
          </span>
          More
        </button>
      </nav>
    </div>
  );
}
