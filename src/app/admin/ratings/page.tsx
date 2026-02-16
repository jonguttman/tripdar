"use client";

import { useState, useEffect } from "react";

interface StrainRatingStats {
  strainSlug: string;
  ratingCount: number;
  avgRating: number;
  latestRatingAt: string;
}

export default function RatingsAdminPage() {
  const [ratings, setRatings] = useState<StrainRatingStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRatings();
  }, []);

  const loadRatings = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/ratings");
      const data = await res.json();

      if (data.success) {
        setRatings(data.data.ratings);
      } else {
        setError(data.error?.message || "Failed to load ratings");
      }
    } catch {
      setError("Network error loading ratings");
    } finally {
      setLoading(false);
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
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const stars = [];

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <span key={`full-${i}`} style={{ color: "#f59e0b" }}>
          ★
        </span>
      );
    }

    if (hasHalfStar) {
      stars.push(
        <span key="half" style={{ color: "#f59e0b" }}>
          ★
        </span>
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <span key={`empty-${i}`} style={{ color: "#d1d5db" }}>
          ★
        </span>
      );
    }

    return stars;
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Strain Ratings</h1>
        <p style={styles.subtitle}>
          {ratings.length} strains have received ratings
        </p>
      </div>

      {error && <div style={styles.errorMessage}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading ratings...</div>
      ) : ratings.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No ratings yet</p>
          <p style={styles.emptySubtext}>
            Ratings will appear here when users submit feedback via partner sites
          </p>
        </div>
      ) : (
        <div style={styles.ratingsGrid}>
          {ratings.map((strain) => (
            <div key={strain.strainSlug} style={styles.ratingCard}>
              <div style={styles.cardHeader}>
                <h3 style={styles.strainName}>{strain.strainSlug}</h3>
                <div style={styles.ratingBadge}>
                  {strain.avgRating.toFixed(1)}
                </div>
              </div>

              <div style={styles.stars}>{renderStars(strain.avgRating)}</div>

              <div style={styles.cardStats}>
                <div style={styles.stat}>
                  <span style={styles.statLabel}>Ratings:</span>
                  <span style={styles.statValue}>{strain.ratingCount}</span>
                </div>
                <div style={styles.stat}>
                  <span style={styles.statLabel}>Latest:</span>
                  <span style={styles.statValue}>
                    {formatDate(strain.latestRatingAt)}
                  </span>
                </div>
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
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    marginBottom: "2rem",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: "#111827",
    margin: "0 0 0.5rem",
  },
  subtitle: {
    color: "#6b7280",
    margin: 0,
  },
  errorMessage: {
    background: "#fee2e2",
    color: "#991b1b",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    marginBottom: "1rem",
    fontSize: "0.875rem",
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
  },
  emptySubtext: {
    fontSize: "0.875rem",
    marginTop: "0.5rem",
  },
  ratingsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
    gap: "1.5rem",
  },
  ratingCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
    transition: "box-shadow 0.2s",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "1rem",
  },
  strainName: {
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "#111827",
    margin: 0,
    flex: 1,
  },
  ratingBadge: {
    background: "#f59e0b",
    color: "white",
    padding: "0.25rem 0.75rem",
    borderRadius: "9999px",
    fontSize: "0.875rem",
    fontWeight: 600,
    marginLeft: "0.5rem",
  },
  stars: {
    fontSize: "1.5rem",
    marginBottom: "1rem",
    display: "flex",
    gap: "0.125rem",
  },
  cardStats: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
    borderTop: "1px solid #e5e7eb",
    paddingTop: "1rem",
  },
  stat: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.875rem",
  },
  statLabel: {
    color: "#6b7280",
  },
  statValue: {
    color: "#111827",
    fontWeight: 500,
  },
};
