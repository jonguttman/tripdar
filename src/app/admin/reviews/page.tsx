"use client";

import { useState, useEffect, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

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
  const { data: session, status } = useSession();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);

  // Load reviews
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
    } catch (err) {
      setError("Network error loading reviews");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (session) {
      loadReviews();
    }
  }, [session, loadReviews]);

  // Clear messages after 5 seconds
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

  // Moderate review
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
        // Update in list
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
    } catch (err) {
      setError("Network error");
    } finally {
      setModerating(null);
    }
  };

  // Show sign-in prompt if not authenticated
  if (status === "loading") {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Reviews Moderation</h1>
          <p style={styles.subtitle}>Sign in with GitHub to manage reviews.</p>
          <button onClick={() => signIn("github")} style={styles.primaryButton}>
            Sign in with GitHub
          </button>
        </div>
      </div>
    );
  }

  // Format date
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

  // Render stars
  const renderStars = (rating: number) => {
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  };

  // Get status badge style
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
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Reviews Moderation</h1>
          <p style={styles.subtitle}>
            Signed in as {session.user?.email} &bull;{" "}
            <button onClick={() => signOut()} style={styles.linkButton}>
              Sign out
            </button>
          </p>
        </div>
      </div>

      {/* Messages */}
      {error && <div style={styles.errorMessage}>{error}</div>}
      {success && <div style={styles.successMessage}>{success}</div>}

      {/* Status Filter */}
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

      {/* Reviews List */}
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
                  <span
                    style={{
                      ...styles.statusBadge,
                      ...getStatusStyle(review.status),
                    }}
                  >
                    {review.status}
                  </span>
                </div>
                <span style={styles.reviewDate}>{formatDate(review.createdAt)}</span>
              </div>

              {review.title && <h3 style={styles.reviewTitle}>{review.title}</h3>}

              <p
                style={{
                  ...styles.reviewBody,
                  ...(expandedReview === review.id
                    ? {}
                    : { maxHeight: "4.5em", overflow: "hidden" }),
                }}
              >
                {review.body}
              </p>

              {review.body.length > 200 && (
                <button
                  onClick={() =>
                    setExpandedReview(expandedReview === review.id ? null : review.id)
                  }
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
                      <span style={styles.infoLabel}>Moderated:</span>{" "}
                      {formatDate(review.moderatedAt)} by {review.moderatedBy}
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
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "2rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "1.5rem",
    paddingBottom: "1rem",
    borderBottom: "1px solid #e5e7eb",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    margin: 0,
    color: "#111827",
  },
  subtitle: {
    fontSize: "0.875rem",
    color: "#6b7280",
    margin: "0.25rem 0 0",
  },
  card: {
    background: "white",
    borderRadius: "12px",
    padding: "2rem",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    textAlign: "center" as const,
    maxWidth: "400px",
    margin: "4rem auto",
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
  primaryButton: {
    background: "#6d28d9",
    color: "white",
    border: "none",
    padding: "0.75rem 1.5rem",
    borderRadius: "8px",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
    marginTop: "1rem",
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
    background: "#f9fafb",
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
