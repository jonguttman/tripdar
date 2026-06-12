"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FilterTabs,
  LoadingState,
  PageHeader,
  cn,
  statusTone,
} from "@/components/admin";

interface Review {
  id: string;
  strainSlug: string;
  rating: number;
  title: string | null;
  body: string;
  sessionHash: string;
  partnerId: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  moderatedAt: string | null;
  moderatedBy: string | null;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function ReviewsAdminPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      setLoading(true);
      const statusParam = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/admin/reviews${statusParam}`);
      const data = await res.json();

      if (data.success) {
        setReviews(data.data.reviews);
      } else {
        setError(data.error?.message || "Failed to load reviews");
      }
    } catch {
      setError("Network error loading reviews");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleModerate = async (reviewId: string, newStatus: "approved" | "rejected") => {
    setModerating(reviewId);
    try {
      const res = await fetch(`/api/admin/reviews/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Review ${newStatus}`);
        setReviews((prev) =>
          prev.map((r) =>
            r.id === reviewId
              ? { ...r, status: newStatus, moderatedAt: new Date().toISOString() }
              : r
          )
        );
      } else {
        setError(data.error?.message || "Failed to moderate review");
      }
    } catch {
      setError("Network error");
    } finally {
      setModerating(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderStars = (rating: number) => {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Reviews" />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      {success && (
        <Alert tone="success" className="mb-4">
          {success}
        </Alert>
      )}

      <div className="mb-6">
        <span className="mb-2 block text-sm text-bark-400">Filter by status:</span>
        <FilterTabs<StatusFilter>
          tabs={(["all", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
          }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
      </div>

      {loading ? (
        <LoadingState label="Loading reviews..." />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon="star"
          title={`No ${statusFilter === "all" ? "" : statusFilter} reviews found.`}
        />
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-bark-800">{review.strainSlug}</span>
                <span className="tracking-[2px] text-amber-500">
                  {renderStars(review.rating)}
                </span>
                <Badge tone={statusTone(review.status)} className="capitalize">
                  {review.status}
                </Badge>
                <span className="ml-auto text-xs text-bark-400">
                  {formatDate(review.createdAt)}
                </span>
              </div>

              {review.title && (
                <h3 className="mb-2 text-base font-semibold text-bark-700">
                  {review.title}
                </h3>
              )}

              <p
                className={cn(
                  "whitespace-pre-wrap text-sm leading-relaxed text-bark-600",
                  expandedReview !== review.id && "line-clamp-3"
                )}
              >
                {review.body}
              </p>

              {review.body.length > 200 && (
                <button
                  type="button"
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                  className="mt-1 cursor-pointer text-sm font-medium text-moss-700 underline underline-offset-2 hover:text-moss-800"
                >
                  {expandedReview === review.id ? "Show less" : "Show more"}
                </button>
              )}

              <div className="mt-4 flex flex-col gap-3 border-t border-bone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-bark-400">
                  <span className="font-medium">Partner:</span> {review.partnerId}
                  {review.moderatedAt && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="font-medium">Moderated:</span> {formatDate(review.moderatedAt)} by {review.moderatedBy}
                    </>
                  )}
                </div>

                {review.status === "pending" && (
                  <div className="flex gap-2 sm:shrink-0">
                    <Button
                      variant="primary"
                      className="flex-1 sm:flex-none"
                      onClick={() => handleModerate(review.id, "approved")}
                      loading={moderating === review.id}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger-ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => handleModerate(review.id, "rejected")}
                      loading={moderating === review.id}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
