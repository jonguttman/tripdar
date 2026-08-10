import InviteConfirmClient from "./InviteConfirmClient";
import InviteReentryClient from "./InviteReentryClient";
import { getStaffInvitePreview, type StaffInviteState } from "@/domain/myco/staffReviewInvitations";

export const dynamic = "force-dynamic";

const STATE_COPY: Record<StaffInviteState, { title: string; body: string }> = {
  ready: {
    title: "Staff review invitation",
    body: "The link is already set to your staff identity. Enter the exact email this invitation was prepared for, then continue.",
  },
  expired: {
    title: "Invitation expired",
    body: "This invitation expired. Enter your email below and we'll send a fresh link.",
  },
  revoked: {
    title: "Invitation revoked",
    body: "This invitation was cancelled. Ask Jon for a new one.",
  },
  used: {
    title: "Invitation already used",
    body: "Signing in on a different phone or computer? Send me a new link.",
  },
  invalid: {
    title: "Invitation unavailable",
    body: "This staff review invitation cannot be used right now. Ask Jon for a fresh link.",
  },
};

export default async function StaffReviewInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getStaffInvitePreview(token);
  const state = preview?.state ?? "invalid";
  const copy = STATE_COPY[state];

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-6 text-neutral-950 sm:px-6">
      <section className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md flex-col justify-center">
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-neutral-500">
          The Mushroom Top
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight">{copy.title}</h1>
        <p className="mt-4 text-base leading-7 text-neutral-700">{copy.body}</p>

        {preview ? (
          <section className="mt-6 rounded-lg border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-500">Continue as</p>
            <p className="mt-1 text-xl font-semibold text-neutral-950">{preview.displayName}</p>
            <p className="mt-1 text-sm text-neutral-500">{preview.emailMasked}</p>
          </section>
        ) : null}

        {preview?.state === "ready" ? (
          <InviteConfirmClient
            token={token}
            csrfToken={preview.csrfToken}
            displayName={preview.displayName}
            emailMasked={preview.emailMasked}
          />
        ) : preview?.state === "used" || preview?.state === "expired" ? (
          <InviteReentryClient />
        ) : (
          <p className="mt-7 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            No session was created and no review state changed.
          </p>
        )}
      </section>
    </main>
  );
}
