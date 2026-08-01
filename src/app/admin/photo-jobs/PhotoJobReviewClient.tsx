"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
  statusTone,
} from "@/components/admin";
import type {
  PhotoLabelRegion,
  PhotoReviewAction,
  PhotoReviewAssetKind,
  PhotoReviewJob,
} from "@/domain/photo-pipeline/review";

const PAGE_SIZE = 25;

function assetUrl(value: string, jobId: string, kind: PhotoReviewAssetKind): string {
  if (/^(https?:|data:|blob:)/.test(value)) return value;
  return `/api/admin/photo-jobs/${encodeURIComponent(jobId)}/image?kind=${kind}`;
}

function formatScore(score: number | null): string {
  return score === null ? "Not measured" : `${Math.round(score * 100)}%`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ComparisonImage({
  title,
  url,
  zoom,
  jobId,
  kind,
  region,
}: {
  title: string;
  url: string | null;
  zoom: number;
  jobId: string;
  kind: PhotoReviewAssetKind;
  region: PhotoLabelRegion | null;
}) {
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const transformOrigin = region && naturalSize
    ? `${((region.left + region.width / 2) / naturalSize.width) * 100}% ${((region.top + region.height / 2) / naturalSize.height) * 100}%`
    : "50% 55%";

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-bark-700">{title}</h3>
        {title === "Premium" && <Badge tone="warning">AI-enhanced</Badge>}
      </div>
      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-bone-300 bg-[linear-gradient(45deg,#eee8dc_25%,transparent_25%),linear-gradient(-45deg,#eee8dc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#eee8dc_75%),linear-gradient(-45deg,transparent_75%,#eee8dc_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assetUrl(url, jobId, kind)}
            alt={`${title} product view`}
            onLoad={(event) => {
              setNaturalSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
            className="max-h-full max-w-full transition-transform duration-150"
            style={{ transform: `scale(${zoom})`, transformOrigin }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-bone-100 px-5 text-center text-sm text-bark-400">
            No {title.toLowerCase()} image is recorded for this job.
          </div>
        )}
      </div>
    </div>
  );
}

export default function PhotoJobReviewClient() {
  const [jobs, setJobs] = useState<PhotoReviewJob[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<PhotoReviewAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [labelVerified, setLabelVerified] = useState(false);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/photo-jobs?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        success: boolean;
        data?: { jobs: PhotoReviewJob[]; total: number };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to load photo jobs");
      }
      setJobs(payload.data.jobs);
      setTotal(payload.data.total);
      setSelectedId((current) =>
        payload.data?.jobs.some((job) => job.id === current)
          ? current
          : (payload.data?.jobs[0]?.id ?? null),
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load photo jobs");
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadJobs();
  }, [loadJobs]);

  const selected = useMemo(
    () => jobs.find((job) => job.id === selectedId) ?? null,
    [jobs, selectedId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabelVerified(false);
    setZoom(1);
    setNotice(null);
  }, [selectedId]);

  async function decide(action: PhotoReviewAction) {
    if (!selected) return;
    if (action === "approve" && !labelVerified) {
      setError("Confirm that you compared the source label before approving.");
      return;
    }
    if (action === "reject" && !window.confirm("Reject this premium photo job?")) return;

    setDeciding(action);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/photo-jobs/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json()) as {
        success: boolean;
        data?: { job: PhotoReviewJob };
        error?: { message?: string };
      };
      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error?.message ?? `Failed to ${action} photo job`);
      }
      setJobs((current) =>
        current.map((job) =>
          job.id === payload.data?.job.id
            ? {
                ...payload.data.job,
                catalogSafeUrl: payload.data.job.catalogSafeUrl ?? job.catalogSafeUrl,
              }
            : job,
        ),
      );
      setLabelVerified(false);
      setNotice(action === "approve" ? "Premium photo approved by you." : "Premium photo rejected.");
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Review decision failed");
    } finally {
      setDeciding(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Premium photo review"
        subtitle="Compare the immutable source, catalog-safe output, and AI-enhanced candidate before making a human decision."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading ? (
        <LoadingState label="Loading premium photo jobs..." />
      ) : jobs.length === 0 ? (
        <EmptyState
          icon="image"
          title="No premium photo jobs"
          description="Premium jobs will appear here once generative processing completes."
        />
      ) : (
        <div className="mt-4 grid gap-5 xl:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="h-fit" padded={false}>
            <div className="border-b border-bone-300 px-4 py-3 text-sm font-semibold text-bark-700">
              Jobs <span className="font-normal text-bark-400">({total})</span>
            </div>
            <div className="max-h-[70vh] divide-y divide-bone-300 overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={`w-full cursor-pointer p-4 text-left transition-colors hover:bg-bone-100 ${
                    job.id === selectedId ? "bg-moss-50 ring-2 ring-inset ring-moss-500" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-semibold text-bark-800">{job.productName}</span>
                    <Badge tone={statusTone(job.status)}>{job.status.replace("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-bark-400">{job.sku} · {job.view}</p>
                  <p className="mt-2 text-xs font-medium text-bark-600">
                    Label fidelity: {formatScore(job.labelFidelityScore)}
                  </p>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-bone-300 p-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
              >
                Previous
              </Button>
              <span className="text-xs text-bark-400">
                {offset + 1}-{Math.min(offset + jobs.length, total)}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={offset + jobs.length >= total}
                onClick={() => setOffset((value) => value + PAGE_SIZE)}
              >
                Next
              </Button>
            </div>
          </Card>

          {selected && (
            <div className="min-w-0 space-y-5">
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-moss-700">{selected.sku}</p>
                    <h2 className="mt-1 font-display text-xl text-bark-800">
                      {[selected.brand, selected.productName, selected.variant].filter(Boolean).join(" · ")}
                    </h2>
                    <p className="mt-1 text-sm text-bark-400">
                      {selected.view} view · created {formatDate(selected.createdAt)} · {selected.jobId}
                    </p>
                  </div>
                  <Badge tone={statusTone(selected.status)}>{selected.status.replace("_", " ")}</Badge>
                </div>

                <div className="mt-5 flex flex-col gap-2 rounded-lg bg-bone-100 p-3 sm:flex-row sm:items-center">
                  <label htmlFor="label-zoom" className="shrink-0 text-sm font-medium text-bark-700">
                    Label zoom {zoom.toFixed(1)}×
                  </label>
                  <input
                    id="label-zoom"
                    type="range"
                    min="1"
                    max="3"
                    step="0.25"
                    value={zoom}
                    onChange={(event) => setZoom(Number(event.target.value))}
                    className="w-full accent-moss-600"
                  />
                  <span className="shrink-0 text-xs text-bark-400">Centered on label region</span>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <ComparisonImage
                    title="Source"
                    url={selected.sourceUrl}
                    zoom={zoom}
                    jobId={selected.id}
                    kind="source"
                    region={selected.labelRegions.source}
                  />
                  <ComparisonImage
                    title="Catalog-safe"
                    url={selected.catalogSafeUrl}
                    zoom={zoom}
                    jobId={selected.id}
                    kind="catalog_safe"
                    region={selected.labelRegions.premium}
                  />
                  <ComparisonImage
                    title="Premium"
                    url={selected.premiumUrl}
                    zoom={zoom}
                    jobId={selected.id}
                    kind="premium"
                    region={selected.labelRegions.premium}
                  />
                </div>
              </Card>

              <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
                <Card>
                  <h3 className="text-sm font-semibold text-bark-700">Validation evidence</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-bone-100 p-4">
                      <p className="text-xs uppercase tracking-wide text-bark-400">Measured label fidelity</p>
                      <p className={`mt-1 text-3xl font-semibold ${selected.labelHardFlagged ? "text-clay-700" : "text-bark-800"}`}>
                        {formatScore(selected.labelFidelityScore)}
                      </p>
                      {selected.labelHardFlagged && (
                        <p className="mt-1 text-xs font-semibold text-clay-700">Critical label delta detected</p>
                      )}
                    </div>
                    <div className="rounded-lg bg-bone-100 p-4">
                      <p className="text-xs uppercase tracking-wide text-bark-400">Source quality</p>
                      <p className="mt-1 text-3xl font-semibold text-bark-800">
                        {formatScore(selected.qualityScore)}
                      </p>
                    </div>
                  </div>
                  <h4 className="mt-5 text-sm font-semibold text-bark-700">Warnings</h4>
                  {selected.warnings.length ? (
                    <ul className="mt-2 space-y-2">
                      {selected.warnings.map((warning, index) => (
                        <li key={`${warning}-${index}`} className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-bark-400">No pipeline warnings recorded.</p>
                  )}
                </Card>

                <Card className="h-fit">
                  <h3 className="text-sm font-semibold text-bark-700">Human approval gate</h3>
                  <p className="mt-2 text-sm text-bark-500">
                    Approval updates this premium PhotoJob only. It does not automatically promote a catalog primary image.
                  </p>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-bone-300 p-3 text-sm text-bark-700">
                    <input
                      type="checkbox"
                      checked={labelVerified}
                      onChange={(event) => setLabelVerified(event.target.checked)}
                      className="mt-0.5 size-4 accent-moss-600"
                    />
                    I compared the source and premium label text, logo, dosage, warnings, and product identity.
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <Button
                      variant="danger-ghost"
                      loading={deciding === "reject"}
                      disabled={deciding !== null}
                      onClick={() => void decide("reject")}
                    >
                      Reject
                    </Button>
                    <Button
                      loading={deciding === "approve"}
                      disabled={!labelVerified || deciding !== null}
                      onClick={() => void decide("approve")}
                    >
                      Approve premium
                    </Button>
                  </div>
                  {selected.approvedBy && selected.approvedAt && (
                    <p className="mt-4 text-xs text-bark-400">
                      Approved by {selected.approvedBy} on {formatDate(selected.approvedAt)}
                    </p>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
