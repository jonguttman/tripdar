"use client";

import { FormEvent, useState } from "react";

const SUCCESS_MESSAGE =
  "If that address is on the reviewer list, a sign-in link is on its way. It expires in 30 minutes.";

export default function InviteReentryClient() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/myco/staff-review/reentry", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await response.json().catch(() => null);
      if (response.status === 202) {
        setMessage(json?.data?.message ?? SUCCESS_MESSAGE);
        setEmail("");
        return;
      }
      setError(json?.error?.message ?? "That didn't work. Try again.");
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div>
        <label htmlFor="staff-reentry-email" className="block text-sm font-medium text-neutral-900">
          Email for your invitation
        </label>
        <input
          id="staff-reentry-email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          className="mt-2 min-h-[54px] w-full rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />
      </div>

      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
          {message}
        </p>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !email.trim()}
        className="min-h-[54px] w-full rounded-lg bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Sending..." : "Send me a new link"}
      </button>
    </form>
  );
}
