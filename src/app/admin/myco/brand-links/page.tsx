"use client";

/**
 * KEWL-2368 (scope item 4) — Adrienne's brand portal link screen.
 *
 * The point of this screen is that Adrienne can hand a brand its own `/b/<token>`
 * link herself instead of asking us to run a curl. The token lifecycle already
 * shipped in KEWL-2460 (`/api/admin/myco/brand-links`); this is only the surface
 * over it, and it deliberately adds no new primitive.
 *
 * Two facts from that API shape this UI, and both contradict the ticket text:
 *
 *  1. **A live link cannot be listed.** Only the SHA-256 hash is stored, so `GET`
 *     returns status/provenance and no URL, by design. The raw URL exists exactly
 *     once — in the `POST` response — so the copy affordance lives in the mint
 *     result, not in the row. A row can tell you a link is alive and whether the
 *     brand ever opened it; it can never show you the link again.
 *  2. **There is no separate regenerate endpoint.** `POST` *is* regenerate: it
 *     revokes every live link for the brand and records `regeneratedFromId`. So
 *     regenerating is destructive to any copy already forwarded, and the UI has
 *     to say so before the click rather than after.
 *
 * Minting here issues a real, sendable production credential. Nothing on this
 * screen sends anything — forwarding the link to a brand stays a human decision.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Icon,
  LoadingState,
  PageHeader,
  Select,
  statusTone,
  type BadgeTone,
} from "@/components/admin";

interface Brand {
  id: string;
  name: string;
  slug: string;
}

interface BrandLinkToken {
  id: string;
  status: string;
  partnerId: string;
  brandId: string | null;
  issuedToEmail: string | null;
  issuedAt: string;
  issuedBy: string | null;
  expiresAt: string | null;
  openedAt: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revocationReason: string | null;
  regeneratedFromId: string | null;
  brand: Brand | null;
}

interface MintedLink {
  brandId: string;
  brandName: string;
  url: string;
  expiresAt: string | null;
  regeneratedFromId: string | null;
}

/** Effective status — a token can be `active` in the DB and already past `expiresAt`. */
type EffectiveStatus = "active" | "revoked" | "expired" | "none";

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "No expiry" },
  { value: "30", label: "Expires in 30 days" },
  { value: "90", label: "Expires in 90 days" },
];

const STATUS_LABEL: Record<EffectiveStatus, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
  none: "No link yet",
};

function effectiveStatus(token: BrandLinkToken | null): EffectiveStatus {
  if (!token) return "none";
  if (token.status === "revoked") return "revoked";
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return "expired";
  }
  return token.status === "active" ? "active" : "revoked";
}

function statusBadgeTone(status: EffectiveStatus): BadgeTone {
  if (status === "expired") return "warning";
  if (status === "none") return "neutral";
  return statusTone(status);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function BrandLinksPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [tokens, setTokens] = useState<BrandLinkToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Per-brand transient UI state, keyed by brand id. */
  const [busyBrandId, setBusyBrandId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  /** Set when POST rejects a multi-partner brand and hands back the candidates. */
  const [partnerChoice, setPartnerChoice] = useState<Record<string, string[]>>({});
  const [selectedPartner, setSelectedPartner] = useState<Record<string, string>>({});
  const [expiry, setExpiry] = useState<Record<string, string>>({});

  const [minted, setMinted] = useState<MintedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [brandsRes, tokensRes] = await Promise.all([
        fetch("/api/admin/myco/brands"),
        fetch("/api/admin/myco/brand-links"),
      ]);
      const brandsJson = await brandsRes.json();
      const tokensJson = await tokensRes.json();
      if (!brandsRes.ok || !brandsJson.success) {
        throw new Error(brandsJson?.error?.message ?? "Failed to load brands");
      }
      if (!tokensRes.ok || !tokensJson.success) {
        throw new Error(tokensJson?.error?.message ?? "Failed to load brand links");
      }
      setBrands(brandsJson.data.brands ?? []);
      setTokens(tokensJson.data.tokens ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The API returns tokens newest-first, so the first hit per brand is the current
   * one. Older rows are superseded revocations and are not surfaced as separate
   * entries — they would read as several live links for one brand.
   */
  const currentTokenByBrand = useMemo(() => {
    const map = new Map<string, BrandLinkToken>();
    for (const token of tokens) {
      if (token.brandId && !map.has(token.brandId)) map.set(token.brandId, token);
    }
    return map;
  }, [tokens]);

  const setError = (brandId: string, message: string | null) =>
    setRowError((prev) => {
      const next = { ...prev };
      if (message) next[brandId] = message;
      else delete next[brandId];
      return next;
    });

  async function mint(brand: Brand) {
    setBusyBrandId(brand.id);
    setError(brand.id, null);
    try {
      const days = expiry[brand.id];
      const res = await fetch("/api/admin/myco/brand-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand.id,
          ...(selectedPartner[brand.id] ? { partnerId: selectedPartner[brand.id] } : {}),
          ...(days ? { expiresInDays: Number(days) } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        // A brand spanning several partners comes back with the candidate ids, so
        // the operator can disambiguate in place instead of being told to use curl.
        const partnerIds: string[] | undefined = json?.error?.partnerIds;
        if (partnerIds?.length) {
          setPartnerChoice((prev) => ({ ...prev, [brand.id]: partnerIds }));
        }
        throw new Error(json?.error?.message ?? "Could not generate a link");
      }
      setPartnerChoice((prev) => {
        const next = { ...prev };
        delete next[brand.id];
        return next;
      });
      setCopied(false);
      setMinted({
        brandId: brand.id,
        brandName: brand.name,
        url: json.data.url,
        expiresAt: json.data.expiresAt ?? null,
        regeneratedFromId: json.data.regeneratedFromId ?? null,
      });
      await load();
    } catch (error) {
      setError(brand.id, error instanceof Error ? error.message : "Could not generate a link");
    } finally {
      setBusyBrandId(null);
    }
  }

  async function revoke(brand: Brand, token: BrandLinkToken) {
    if (
      !window.confirm(
        `Revoke ${brand.name}'s portal link?\n\nAnyone holding the current URL loses access immediately. You can generate a new one afterwards.`
      )
    ) {
      return;
    }
    setBusyBrandId(brand.id);
    setError(brand.id, null);
    try {
      const res = await fetch("/api/admin/myco/brand-links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: token.id, reason: "revoked from the admin brand links screen" }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Could not revoke the link");
      }
      if (minted?.brandId === brand.id) setMinted(null);
      await load();
    } catch (error) {
      setError(brand.id, error instanceof Error ? error.message : "Could not revoke the link");
    } finally {
      setBusyBrandId(null);
    }
  }

  function confirmRegenerate(brand: Brand) {
    if (
      !window.confirm(
        `Generate a new link for ${brand.name}?\n\nThis immediately kills the link they already have — if it was forwarded, that copy stops working and you will need to send the new one.`
      )
    ) {
      return;
    }
    void mint(brand);
  }

  async function copyMinted() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.url);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context; the URL is selectable above.
      setCopied(false);
      window.prompt("Copy this link:", minted.url);
    }
  }

  if (loading) return <LoadingState label="Loading brand links…" />;

  return (
    <div>
      <PageHeader
        title="Brand portal links"
        subtitle="Give a brand its own no-login link to correct its product info. One live link per brand."
      />

      {loadError && (
        <Alert tone="error" className="mb-4">
          {loadError}
        </Alert>
      )}

      {/*
        This is the one thing an operator has to internalise before using the screen,
        so it is stated up front rather than discovered at the moment of loss.
      */}
      <Alert tone="warning" className="mb-4">
        <strong>A link is only shown once.</strong> We store a one-way hash of it, never
        the link itself, so it cannot be looked up again later. Copy it when you generate
        it. If you lose it, generate a new one — which turns the old one off.
      </Alert>

      {minted && (
        <Card className="mb-6 border-moss-300 bg-moss-50">
          <div className="flex items-start gap-2">
            <Icon name="key" size={18} className="mt-0.5 shrink-0 text-moss-700" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-bark-800">
                {minted.brandName}&rsquo;s link is ready
              </p>
              <p className="mt-1 text-sm text-bark-500">
                {minted.regeneratedFromId
                  ? "Their previous link has been turned off. Send this one instead."
                  : "This is the first link issued to this brand."}
                {minted.expiresAt ? ` Expires ${formatDate(minted.expiresAt)}.` : ""}
              </p>
              <p className="mt-3 break-all rounded-lg border border-moss-200 bg-bone-50 px-3 py-2 font-mono text-sm text-bark-800">
                {minted.url}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button onClick={copyMinted}>
                  <Icon name={copied ? "check" : "copy"} size={16} />
                  {copied ? "Copied" : "Copy link"}
                </Button>
                <Button variant="secondary" onClick={() => setMinted(null)}>
                  Done
                </Button>
              </div>
              <p className="mt-3 text-xs text-bark-400">
                Sending this to a brand is a decision, not a step — this screen does not
                send anything.
              </p>
            </div>
          </div>
        </Card>
      )}

      {brands.length === 0 ? (
        <EmptyState
          icon="spark"
          title="No brands yet"
          description="Brands appear here once catalog products are attributed to them."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {brands.map((brand) => {
            const token = currentTokenByBrand.get(brand.id) ?? null;
            const status = effectiveStatus(token);
            const busy = busyBrandId === brand.id;
            const partnerIds = partnerChoice[brand.id];

            return (
              <Card key={brand.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-bark-800">{brand.name}</p>
                      <Badge tone={statusBadgeTone(status)}>{STATUS_LABEL[status]}</Badge>
                    </div>

                    {token ? (
                      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-bark-500 sm:grid-cols-2">
                        <div>
                          <dt className="inline text-bark-400">Issued </dt>
                          <dd className="inline">{formatDate(token.issuedAt)}</dd>
                        </div>
                        <div>
                          <dt className="inline text-bark-400">Opened by brand </dt>
                          {/* Never opened is the signal that a send did not land. */}
                          <dd className="inline">
                            {token.openedAt ? formatDate(token.openedAt) : "Not yet"}
                          </dd>
                        </div>
                        {token.issuedBy && (
                          <div className="min-w-0">
                            <dt className="inline text-bark-400">Issued by </dt>
                            <dd className="inline break-all">{token.issuedBy}</dd>
                          </div>
                        )}
                        {token.expiresAt && (
                          <div>
                            <dt className="inline text-bark-400">Expires </dt>
                            <dd className="inline">{formatDate(token.expiresAt)}</dd>
                          </div>
                        )}
                        {status === "revoked" && (
                          <div className="min-w-0 sm:col-span-2">
                            <dt className="inline text-bark-400">Revoked </dt>
                            <dd className="inline">
                              {formatDate(token.revokedAt)}
                              {token.revocationReason ? ` — ${token.revocationReason}` : ""}
                            </dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="mt-2 text-sm text-bark-400">
                        This brand has never been given a portal link.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                    {status === "active" ? (
                      <>
                        <Button
                          variant="secondary"
                          loading={busy}
                          disabled={busy}
                          onClick={() => confirmRegenerate(brand)}
                        >
                          Generate new link
                        </Button>
                        <Button
                          variant="danger-ghost"
                          disabled={busy}
                          onClick={() => void revoke(brand, token!)}
                        >
                          Revoke
                        </Button>
                      </>
                    ) : (
                      <Button loading={busy} disabled={busy} onClick={() => void mint(brand)}>
                        <Icon name="key" size={16} />
                        {status === "none" ? "Generate link" : "Generate new link"}
                      </Button>
                    )}
                  </div>
                </div>

                {status !== "active" && (
                  <div className="mt-3 max-w-xs">
                    <Field label="Link lifetime">
                      <Select
                        value={expiry[brand.id] ?? ""}
                        onChange={(event) =>
                          setExpiry((prev) => ({ ...prev, [brand.id]: event.target.value }))
                        }
                      >
                        {EXPIRY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}

                {partnerIds?.length ? (
                  <div className="mt-3 max-w-xs">
                    <Field
                      label="Which store?"
                      hint="This brand sells under more than one partner, so the link has to be scoped to one."
                    >
                      <Select
                        value={selectedPartner[brand.id] ?? ""}
                        onChange={(event) =>
                          setSelectedPartner((prev) => ({
                            ...prev,
                            [brand.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select a store…</option>
                        {partnerIds.map((partnerId) => (
                          <option key={partnerId} value={partnerId}>
                            {partnerId}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : null}

                {rowError[brand.id] && (
                  <Alert tone="error" className="mt-3">
                    {rowError[brand.id]}
                  </Alert>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
