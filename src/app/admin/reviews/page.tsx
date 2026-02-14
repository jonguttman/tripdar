"use client";

import { useState, useEffect, useCallback } from "react";

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

  const getStatusStyle = (reviewStatus: string) => {
    switch (reviewStatus) {
      case "pending":
        return { background: "#fef3c7", color: "#92400e" };
      case "approved":
        return { background: "#d1fae5", color: "#065f46" };
      case "rejected":
        return { background: "#fee2e2", color: "#991b1b" };
      default:
        return { background: "#e5e7eb", color: "#374151" };
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Reviews</h1>
      </div>

      {error && <div style={styles.errorMessage}>{error}</div>}
      {success && <div style={styles.successMessage}>{success}</div>}

      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Filter by status:</span>
        {(["all", "pending", "approved", "rejected"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            style={{
              ...styles.filterButton,
              ...(statusFilter === s ? styles.filterButtonActive : {}),
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={styles.loading}>Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div style={styles.emptyState}>
          No {statusFilter === "all" ? "" : statusFilter} reviews found.
        </div>
      ) : (
        <div style={styles.reviewsList}>
          {reviews.map((review) => (
            <div key={review.id} style={styles.reviewCard}>
              <div style={styles.reviewHeader}>
                <div style={styles.reviewMeta}>
                  <span style={styles.strainSlug}>{review.strainSlug}</span>
                  <span style={styles.stars}>{renderStars(review.rating)}</span>
                  <span style={{ ...styles.statusBadge, ...getStatusStyle(review.status) }}>
                    {review.status}
                  </span>
                </div>
                <span style={styles.reviewDate}>{formatDate(review.createdAt)}</span>
              </div>

              {review.title && <h3 style={styles.reviewTitle}>{review.title}</h3>}

              <p
                style={{
                  ...styles.reviewBody,
                  ...(expandedReview === review.id ? {} : { maxHeight: "4.5em", overflow: "hidden" }),
                }}
              >
                {review.body}
              </p>

              {review.body.length > 200 && (
                <button
                  onClick={() => setExpandedReview(expandedReview === review.id ? null : review.id)}
                  style={styles.linkButton}
                >
                  {expandedReview === review.id ? "Show less" : "Show more"}
                </button>
              )}

              <div style={styles.reviewFooter}>
                <div style={styles.reviewInfo}>
                  <span style={styles.infoLabel}>Partner:</span> {review.partnerId}
                  {review.moderatedAt && (
                    <>
                      <span style={styles.infoDivider}>•</span>
                      <span style={styles.infoLabel}>Moderated:</span> {formatDate(review.moderatedAt)} by {review.moderatedBy}
                    </>
                  )}
                </div>

                {review.status === "pending" && (
                  <div style={styles.actionButtons}>
                    <button
                      onClick={() => handleModerate(review.id, "approved")}
                      disabled={moderating === review.id}
                      style={styles.approveButton}
                    >
                      {moderating === review.id ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleModerate(review.id, "rejected")}
                      disabled={moderating === review.id}
                      style={styles.rejectButton}
                    >
                      {moderating === review.id ? "..." : "Reject"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "2rem",
  },
  header: {
    marginBottom: "1.5rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: 600,
    margin: 0,
    color: "#111827",
  },
  linkButton: {
    background: "none",
    border: "none",
    color: "#6d28d9",
    cursor: "pointer",
    fontSize: "inherit",
    padding: 0,
    textDecoration: "underline",
  },
  errorMessage: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.875rem",
  },
  successMessage: {
    background: "#d1fae5",
    color: "#065f46",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.875rem",
  },
  filterBar: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "1.5rem",
    flexWrap: "wrap" as const,
  },
  filterLabel: {
    fontSize: "0.875rem",
    color: "#6b7280",
    marginRight: "0.5rem",
  },
  filterButton: {
    padding: "0.5rem 1rem",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.875rem",
    color: "#374151",
  },
  filterButtonActive: {
    background: "#6d28d9",
    borderColor: "#6d28d9",
    color: "white",
  },
  loading: {
    textAlign: "center" as const,
    padding: "3rem",
    color: "#6b7280",
  },
  emptyState: {
    textAlign: "center" as const,
    padding: "3rem",
    color: "#9ca3af",
    fontStyle: "italic",
    background: "white",
    borderRadius: "12px",
    border: "2px dashed #e5e7eb",
  },
  reviewsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  reviewCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.25rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
  },
  reviewHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.75rem",
  },
  reviewMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  },
  strainSlug: {
    fontWeight: 600,
    color: "#111827",
    fontSize: "1rem",
  },
  stars: {
    color: "#f59e0b",
    fontSize: "1rem",
    letterSpacing: "2px",
  },
  statusBadge: {
    fontSize: "0.75rem",
    fontWeight: 500,
    padding: "0.25rem 0.75rem",
    borderRadius: "12px",
    textTransform: "capitalize" as const,
  },
  reviewDate: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  reviewTitle: {
    margin: "0 0 0.5rem",
    fontSize: "1rem",
    fontWeight: 600,
    color: "#374151",
  },
  reviewBody: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#4b5563",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
  },
  reviewFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: "1px solid #f3f4f6",
    flexWrap: "wrap" as const,
    gap: "0.75rem",
  },
  reviewInfo: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  infoLabel: {
    fontWeight: 500,
  },
  infoDivider: {
    margin: "0 0.5rem",
  },
  actionButtons: {
    display: "flex",
    gap: "0.5rem",
  },
  approveButton: {
    padding: "0.5rem 1rem",
    background: "#10b981",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  },
  rejectButton: {
    padding: "0.5rem 1rem",
    background: "#ef4444",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
    fontSize: "0.875rem",
  },
};
