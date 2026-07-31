"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  statusTone,
} from "@/components/admin";

type ReviewDecision = "accepted" | "rejected";

interface SubmissionField {
  id: string;
  fieldName: string;
  label: string;
  previousValue: unknown;
  currentValue: unknown;
  submittedValue: unknown;
  disposition: string;
  dispositionBy: string | null;
  dispositionAt: string | null;
  dispositionReason: string | null;
}

interface BrandField {
  fieldName: string;
  label: string;
  currentValue: unknown;
  submittedValue: unknown;
  decision: string;
  reason: string | null;
}

interface ProductPhoto {
  id: string;
  catalogItemId: string;
  url: string;
  sourceUrl: string | null;
  tag: string;
  flavor: string | null;
  status: string;
  rejectionReason: string | null;
}

interface BrandAsset {
  kind: "logo" | "artwork";
  label: string;
  asset: { url?: string; displayUrl?: string; filename?: string };
  currentValue: string | null;
  decision: string;
  reason: string | null;
}

interface BrandSubmission {
  id: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  partner: { id: string; name: string };
  brand: { id: string; name: string; slug: string };
  catalogItem: { id: string; productName: string } | null;
  submitter: {
    name: string;
    role: string;
    contactPermission: boolean;
    preferredContactMethod: string | null;
    contactHandle: string | null;
    consentToContactAt: string | null;
    imageUsageGrant: boolean;
    imageUsageGrantedAt: string | null;
    imageUsageGrantedBy: string | null;
  };
  productFields: SubmissionField[];
  brandFields: BrandField[];
  productPhotos: ProductPhoto[];
  brandAssets: BrandAsset[];
  missingProducts: unknown[];
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null);
    if (!entries.length) return "—";
    return entries.map(([key, item]) => `${key}: ${String(item)}`).join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function assetUrl(asset: BrandAsset): string | null {
  return asset.asset.displayUrl ?? asset.asset.url ?? null;
}

function missingProductLabel(product: unknown): string {
  if (!product || typeof product !== "object") return "Missing product";
  const input = product as Record<string, unknown>;
  return typeof input.productName === "string" ? input.productName : "Missing product";
}

export default function BrandSubmissionsPage() {
  const [submissions, setSubmissions] = useState<BrandSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/myco/brand-submissions");
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Failed to load submissions");
      }
      setSubmissions(json.data.submissions ?? []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(
    submissionId: string,
    key: string,
    decision: ReviewDecision,
    body: Record<string, unknown>,
  ) {
    setBusyKey(`${submissionId}:${key}:${decision}`);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/myco/brand-submissions/${submissionId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error?.message ?? "Could not save decision");
      }
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not save decision");
    } finally {
      setBusyKey(null);
    }
  }

  const pendingCount = submissions.filter((submission) => submission.status === "pending").length;

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <LoadingState label="Loading brand submissions..." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Brand Submissions"
        subtitle={`${pendingCount} pending review${pendingCount === 1 ? "" : "s"}`}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {loadError && <Alert tone="error">{loadError}</Alert>}
      {actionError && <Alert tone="error">{actionError}</Alert>}

      {submissions.length === 0 ? (
        <EmptyState title="No brand submissions yet" description="When a brand sends corrections, they will appear here." />
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <Card key={submission.id} className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl text-bark-800">{submission.brand.name}</h2>
                    <Badge tone={statusTone(submission.status)}>{submission.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-bark-500">
                    {submission.partner.name} · submitted {formatDate(submission.createdAt)}
                  </p>
                </div>
                <div className="text-sm text-bark-500 sm:text-right">
                  <div>{submission.submitter.name}</div>
                  <div>{submission.submitter.role}</div>
                </div>
              </div>

              <section className="grid gap-3 rounded-lg border border-bone-300 bg-bone-100 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs font-semibold uppercase text-bark-400">Contact consent</div>
                  <div className="mt-1 text-bark-700">
                    {submission.submitter.contactPermission ? "Granted" : "Declined"}
                  </div>
                  <div className="text-bark-500">{formatDate(submission.submitter.consentToContactAt)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-bark-400">Preferred method</div>
                  <div className="mt-1 text-bark-700">
                    {submission.submitter.preferredContactMethod ?? "—"}
                  </div>
                  <div className="break-words text-bark-500">{submission.submitter.contactHandle ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-bark-400">Image usage grant</div>
                  <div className="mt-1 text-bark-700">
                    {submission.submitter.imageUsageGrant ? "Granted" : "Not granted"}
                  </div>
                  <div className="text-bark-500">{formatDate(submission.submitter.imageUsageGrantedAt)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase text-bark-400">Granted by</div>
                  <div className="mt-1 break-words text-bark-700">
                    {submission.submitter.imageUsageGrantedBy ?? "—"}
                  </div>
                </div>
              </section>

              {submission.productFields.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase text-bark-500">Product fields</h3>
                  <div className="overflow-x-auto rounded-lg border border-bone-300">
                    <table className="min-w-[760px] w-full text-left text-sm">
                      <thead className="bg-bone-100 text-xs uppercase text-bark-400">
                        <tr>
                          <th className="px-3 py-2">Field</th>
                          <th className="px-3 py-2">Current</th>
                          <th className="px-3 py-2">Brand submitted</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2 text-right">Decision</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-bone-300">
                        {submission.productFields.map((field) => (
                          <tr key={field.id} className="align-top">
                            <td className="px-3 py-3 font-medium text-bark-700">{field.label}</td>
                            <td className="px-3 py-3 text-bark-500">{formatValue(field.currentValue)}</td>
                            <td className="px-3 py-3 text-bark-800">{formatValue(field.submittedValue)}</td>
                            <td className="px-3 py-3">
                              <Badge tone={statusTone(field.disposition)}>{field.disposition}</Badge>
                            </td>
                            <td className="px-3 py-3">
                              {field.disposition === "pending" ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    loading={busyKey === `${submission.id}:field:${field.id}:accepted`}
                                    onClick={() =>
                                      decide(submission.id, `field:${field.id}`, "accepted", {
                                        fieldDecisions: [{ id: field.id, decision: "accepted" }],
                                      })
                                    }
                                  >
                                    <Icon name="check" size={16} />
                                    Accept
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="danger-ghost"
                                    loading={busyKey === `${submission.id}:field:${field.id}:rejected`}
                                    onClick={() =>
                                      decide(submission.id, `field:${field.id}`, "rejected", {
                                        fieldDecisions: [{ id: field.id, decision: "rejected" }],
                                      })
                                    }
                                  >
                                    <Icon name="x" size={16} />
                                    Reject
                                  </Button>
                                </div>
                              ) : (
                                <div className="text-right text-xs text-bark-400">
                                  {field.dispositionBy ?? "reviewed"} · {formatDate(field.dispositionAt)}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {submission.brandFields.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase text-bark-500">Brand fields</h3>
                  <div className="space-y-2">
                    {submission.brandFields.map((field) => (
                      <div key={field.fieldName} className="grid gap-3 rounded-lg border border-bone-300 p-3 text-sm md:grid-cols-[1fr_1fr_auto] md:items-center">
                        <div>
                          <div className="font-medium text-bark-700">{field.label}</div>
                          <div className="mt-1 text-bark-500">Current: {formatValue(field.currentValue)}</div>
                        </div>
                        <div className="text-bark-800">Submitted: {formatValue(field.submittedValue)}</div>
                        {field.decision === "pending" ? (
                          <div className="flex gap-2 md:justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={busyKey === `${submission.id}:brand-field:${field.fieldName}:accepted`}
                              onClick={() =>
                                decide(submission.id, `brand-field:${field.fieldName}`, "accepted", {
                                  brandFieldDecisions: [{ fieldName: field.fieldName, decision: "accepted" }],
                                })
                              }
                            >
                              <Icon name="check" size={16} />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-ghost"
                              loading={busyKey === `${submission.id}:brand-field:${field.fieldName}:rejected`}
                              onClick={() =>
                                decide(submission.id, `brand-field:${field.fieldName}`, "rejected", {
                                  brandFieldDecisions: [{ fieldName: field.fieldName, decision: "rejected" }],
                                })
                              }
                            >
                              <Icon name="x" size={16} />
                              Reject
                            </Button>
                          </div>
                        ) : (
                          <Badge tone={statusTone(field.decision)}>{field.decision}</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {(submission.productPhotos.length > 0 || submission.brandAssets.length > 0) && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase text-bark-500">Assets</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {submission.productPhotos.map((photo) => (
                      <div key={photo.id} className="rounded-lg border border-bone-300 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt="" className="aspect-square w-full rounded-lg bg-bone-200 object-cover" />
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-bark-700">{photo.tag}</div>
                            <div className="text-xs text-bark-400">{photo.flavor ?? "All flavors"}</div>
                          </div>
                          <Badge tone={statusTone(photo.status)}>{photo.status}</Badge>
                        </div>
                        {photo.status === "pending" && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              full
                              loading={busyKey === `${submission.id}:photo:${photo.id}:accepted`}
                              onClick={() =>
                                decide(submission.id, `photo:${photo.id}`, "accepted", {
                                  photoDecisions: [{ id: photo.id, decision: "accepted" }],
                                })
                              }
                            >
                              <Icon name="check" size={16} />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-ghost"
                              full
                              loading={busyKey === `${submission.id}:photo:${photo.id}:rejected`}
                              onClick={() =>
                                decide(submission.id, `photo:${photo.id}`, "rejected", {
                                  photoDecisions: [{ id: photo.id, decision: "rejected" }],
                                })
                              }
                            >
                              <Icon name="x" size={16} />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                    {submission.brandAssets.map((asset) => (
                      <div key={asset.kind} className="rounded-lg border border-bone-300 p-3">
                        {assetUrl(asset) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={assetUrl(asset)!} alt="" className="aspect-square w-full rounded-lg bg-bone-200 object-contain" />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-bone-200 text-bark-400">
                            <Icon name="image" size={24} />
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-bark-700">{asset.label}</div>
                            <div className="truncate text-xs text-bark-400">{asset.asset.filename ?? "Uploaded asset"}</div>
                          </div>
                          <Badge tone={statusTone(asset.decision)}>{asset.decision}</Badge>
                        </div>
                        {asset.decision === "pending" && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              full
                              loading={busyKey === `${submission.id}:brand-asset:${asset.kind}:accepted`}
                              onClick={() =>
                                decide(submission.id, `brand-asset:${asset.kind}`, "accepted", {
                                  brandAssetDecisions: [{ kind: asset.kind, decision: "accepted" }],
                                })
                              }
                            >
                              <Icon name="check" size={16} />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-ghost"
                              full
                              loading={busyKey === `${submission.id}:brand-asset:${asset.kind}:rejected`}
                              onClick={() =>
                                decide(submission.id, `brand-asset:${asset.kind}`, "rejected", {
                                  brandAssetDecisions: [{ kind: asset.kind, decision: "rejected" }],
                                })
                              }
                            >
                              <Icon name="x" size={16} />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {submission.missingProducts.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase text-bark-500">Missing products</h3>
                  <div className="space-y-2">
                    {submission.missingProducts.map((product, index) => (
                      <div key={index} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="font-medium text-amber-900">{missingProductLabel(product)}</div>
                        <div className="mt-1 text-amber-800">{formatValue(product)}</div>
                        <div className="mt-2 text-xs text-amber-700">
                          No existing catalog record. Create or match this product outside the field diff.
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
