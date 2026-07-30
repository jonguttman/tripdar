/**
 * `/b/<token>` — the brand's front door (KEWL-2331).
 *
 * Server-rendered so the brand sees its own products immediately, with no spinner
 * and no flash of an empty form. The token is resolved here and never sent to the
 * client beyond the URL it already came in on.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadBrandPortalContext, markTokenOpened } from "@/domain/myco/brandPortalData";
import BrandPortalClient from "./BrandPortalClient";
import InvalidLink from "./InvalidLink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A private, per-brand link should never end up in an index or a preview card. */
export const metadata: Metadata = {
  title: "Your brand on Tripdar",
  robots: { index: false, follow: false, nocache: true },
};

export default async function BrandPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const lookup = await loadBrandPortalContext(token);

  if (!lookup.ok) {
    if (lookup.reason === "revoked" || lookup.reason === "expired") {
      return <InvalidLink reason={lookup.reason} />;
    }
    notFound();
  }

  await markTokenOpened(lookup.context.tokenId);

  return (
    <BrandPortalClient
      token={token}
      brand={lookup.context.brand}
      products={lookup.context.products}
      lastSubmissionAt={lookup.context.lastSubmissionAt?.toISOString() ?? null}
    />
  );
}
