"use client";

/**
 * KEWL-2457 — Jon's review queue for staff catalog edits.
 *
 * Every card has to answer one question: *should this value reach a customer?* So it
 * leads with before → after rather than with metadata. Who submitted it, where they got
 * it, and when are the tiebreakers underneath, not the headline.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterTabs,
  LoadingState,
  PageHeader,
  Textarea,
  statusTone,
  type FilterTab,
} from "@/components/admin";

type QueueStatus = "pending" | "accepted" | "rejected";

interface QueueChange {
  id: string;
  catalogItemId: string;
  productName: string;
  brand: string | null;
  format: string;
  photoUrl: string | null;
  fieldName: string;
  fieldLabel: string;
  tier: string | null;
  previousValue: unknown;
  submittedValue: unknown;
  reviewerId: string;
  reviewerName: string | null;
  reviewerEmail: string | null;
  source: string;
  disposition: string;
  dispositionBy: string | null;
  dispositionAt: string | null;
  dispositionReason: string | null;
  createdAt: string;
}

const SOURCE_COPY: Record<string, string> = {
  packaging: "Read it off the packaging",
  "brand-provided": "The brand told them",
  "personal-knowledge": "They know the product",
  unsure: "Not sure",
};

/** "Not sure" is the one source that should visibly lower confidence in the card. */
function sourceTone(source: string) {
  return source === "unsure" ? "warning" : "neutral";
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value === "__confirmed_absent__") return "Nothing on the package";
  if (value === "__unknown__") return "I don't know";
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "string") return value.trim() || null;
  return String(value);
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export default function CatalogReviewPage() {
  const [status, setStatus] = useState<QueueStatus>("pending");
  const [changes, setChanges] = useState<QueueChange[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async (next: QueueStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/myco/catalog-changes?status=${next}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(payload?.error?.message ?? "Could not load the queue.");
        setChanges([]);
        return;
      }
      setChanges(payload.data.changes);
      setPendingCount(payload.data.pendingCount);
    } catch {
      setError("Network error — try again.");
      setChanges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function decide(id: string, decision: "accept" | "reject", why?: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/myco/catalog-changes/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, ...(why ? { reason: why } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload.success) {
        setError(payload?.error?.message ?? "Could not save that decision.");
        return;
      }
      // Drop the decided card rather than refetching the whole queue: Jon works
      // top-down and a reload would move everything under his thumb mid-pass.
      setChanges((current) => current.filter((change) => change.id !== id));
      setPendingCount((count) => Math.max(0, count - 1));
      setRejecting(null);
      setReason("");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusyId(null);
    }
  }

  const tabs: FilterTab[] = [
    { value: "pending", label: "Waiting on you", count: pendingCount },
    { value: "accepted", label: "Accepted" },
    { value: "rejected", label: "Rejected" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Staff catalog edits"
        subtitle="Nothing here is live yet. A staff edit only reaches a customer once you accept it."
      />

      <FilterTabs
        tabs={tabs}
        value={status}
        onChange={(next) => setStatus(next as QueueStatus)}
      />

      {error && (
        <Alert tone="error" className="mt-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <LoadingState />
      ) : changes.length === 0 ? (
        <EmptyState
          title={status === "pending" ? "Nothing waiting on you" : "Nothing here yet"}
          description={
            status === "pending"
              ? "Every staff edit has been decided. New ones land here as soon as they're submitted."
              : "Decisions you make will show up here."
          }
        />
      ) : (
        <div className="mt-4 space-y-3">
          {changes.map((change) => {
            const before = formatValue(change.previousValue);
            const after = formatValue(change.submittedValue);
            const isBusy = busyId === change.id;
            return (
              <Card key={change.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-bark-800">
                      {change.productName}
                    </p>
                    <p className="truncate text-xs text-bark-400">
                      {change.brand ?? "No brand"} · {change.format}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {change.tier && <Badge tone="neutral">Tier {change.tier}</Badge>}
                    <Badge tone={statusTone(change.disposition)}>
                      {change.disposition}
                    </Badge>
                  </div>
                </div>

                <p className="mt-3 text-sm font-medium text-bark-700">
                  {change.fieldLabel}
                </p>

                {/* Before → after. `before` being empty is the common case and is said
                    plainly, because "filled a blank" and "overwrote what we had" are
                    very different decisions. */}
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-bone-300 bg-bone-100 p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-bark-400">
                      Was
                    </p>
                    <p className="mt-1 text-sm break-words text-bark-600">
                      {before ?? "Empty"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-moss-200 bg-moss-50 p-3">
                    <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-moss-700">
                      They say
                    </p>
                    <p className="mt-1 text-sm font-medium break-words text-bark-800">
                      {after ?? "(blank)"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-bark-400">
                  <Badge tone={sourceTone(change.source)}>
                    {SOURCE_COPY[change.source] ?? change.source}
                  </Badge>
                  <span>
                    {change.reviewerName ?? change.reviewerId}
                    {change.reviewerEmail ? ` (${change.reviewerEmail})` : ""}
                  </span>
                  <span>·</span>
                  <span>{formatWhen(change.createdAt)}</span>
                  <Link
                    href={`/admin/myco?product=${change.catalogItemId}`}
                    className="text-moss-700 underline underline-offset-2"
                  >
                    Open product
                  </Link>
                </div>

                {change.dispositionAt && (
                  <p className="mt-2 text-xs text-bark-400">
                    {change.disposition} by {change.dispositionBy ?? "an admin"} on{" "}
                    {formatWhen(change.dispositionAt)}
                    {change.dispositionReason ? ` — ${change.dispositionReason}` : ""}
                  </p>
                )}

                {change.disposition === "pending" && (
                  <div className="mt-4">
                    {rejecting === change.id ? (
                      <div className="space-y-2">
                        <Textarea
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Why are you rejecting it? (optional, but it's the only record of the reason)"
                          rows={2}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="danger"
                            loading={isBusy}
                            onClick={() => void decide(change.id, "reject", reason)}
                          >
                            Reject this edit
                          </Button>
                          <Button
                            variant="ghost"
                            disabled={isBusy}
                            onClick={() => {
                              setRejecting(null);
                              setReason("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          loading={isBusy}
                          onClick={() => void decide(change.id, "accept")}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="danger-ghost"
                          disabled={isBusy}
                          onClick={() => {
                            setRejecting(change.id);
                            setReason("");
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
