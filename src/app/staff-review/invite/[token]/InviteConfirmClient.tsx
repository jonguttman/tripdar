"use client";

import { FormEvent, useState } from "react";

interface InviteConfirmClientProps {
  token: string;
  csrfToken: string;
  displayName: string;
  emailMasked: string;
}

export default function InviteConfirmClient({
  token,
  csrfToken,
  displayName,
  emailMasked,
}: InviteConfirmClientProps) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch(`/api/myco/staff-review/invitations/${token}/confirm`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, csrfToken }),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok || json?.success !== true || !json?.data?.redirectTo) {
      setSubmitting(false);
      setError(json?.error?.message ?? "This invitation cannot be used.");
      return;
    }
    window.location.assign(json.data.redirectTo);
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-4">
      <div>
        <label htmlFor="staff-invite-email" className="block text-sm font-medium text-neutral-900">
          Confirm your email
        </label>
        <input
          id="staff-invite-email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={emailMasked}
          className="mt-2 min-h-[54px] w-full rounded-lg border border-neutral-300 bg-white px-4 text-base text-neutral-950 outline-none focus:border-neutral-950 focus:ring-2 focus:ring-neutral-950/10"
        />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting || !email.trim()}
        className="min-h-[54px] w-full rounded-lg bg-neutral-950 px-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Continuing..." : `Continue as ${displayName}`}
      </button>
    </form>
  );
}
