"use client";

import { useState, useEffect, useCallback } from "react";

interface OverviewStats {
  period: string;
  totalViews: number;
  totalSearches: number;
  totalQuizCompletions: number;
  totalRatings: number;
  totalReviews: number;
  totalReports: number;
  avgRating: number | null;
  viewsTrend: number;
  ratingsTrend: number;
}

interface StrainStats {
  strainSlug: string;
  views: number;
  ratings: number;
  reviews: number;
  reports: number;
  avgRating: number | null;
}

interface RecentActivity {
  eventType: string;
  entitySlug: string | null;
  createdAt: string;
}

interface TrendDataPoint {
  date: string;
  views: number;
  ratings: number;
  reviews: number;
  reports: number;
}

type PeriodFilter = "7d" | "30d" | "90d";

export default function AnalyticsDashboardPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [topStrains, setTopStrains] = useState<StrainStats[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>("7d");

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [overviewRes, trendsRes] = await Promise.all([
        fetch(`/api/admin/analytics/overview?period=${period}`),
        fetch(`/api/admin/analytics/trends?period=${period}`),
      ]);

      const overviewData = await overviewRes.json();
      const trendsData = await trendsRes.json();

      if (overviewData.success) {
        setStats(overviewData.data.stats);
        setTopStrains(overviewData.data.topStrains);
        setRecentActivity(overviewData.data.recentActivity);
      } else {
        setError(overviewData.error?.message || "Failed to load analytics");
      }

      if (trendsData.success) {
        setTrendData(trendsData.data.dataPoints);
      }
    } catch {
      setError("Network error loading analytics");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getTrendDisplay = (trend: number) => {
    if (trend > 0) {
      return { arrow: "↑", color: "#10b981", label: `+${trend}%` };
    } else if (trend < 0) {
      return { arrow: "↓", color: "#ef4444", label: `${trend}%` };
    }
    return { arrow: "→", color: "#6b7280", label: "0%" };
  };

  const getEventTypeDisplay = (eventType: string) => {
    const displays: Record<string, { label: string; color: string }> = {
      page_view: { label: "View", color: "#3b82f6" },
      search: { label: "Search", color: "#8b5cf6" },
      quiz_complete: { label: "Quiz", color: "#10b981" },
      rating: { label: "Rating", color: "#f59e0b" },
      review: { label: "Review", color: "#6366f1" },
      report: { label: "Report", color: "#ec4899" },
    };
    return displays[eventType] || { label: eventType, color: "#6b7280" };
  };

  const maxViews = Math.max(...trendData.map((d) => d.views), 1);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Analytics</h1>
      </div>

      {/* Period Filter */}
      <div style={styles.filterBar}>
        <span style={styles.filterLabel}>Time period:</span>
        {(["7d", "30d", "90d"] as PeriodFilter[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              ...styles.filterButton,
              ...(period === p ? styles.filterButtonActive : {}),
            }}
          >
            {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
          </button>
        ))}
      </div>

      {error && <div style={styles.errorMessage}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading analytics...</div>
      ) : (
        <>
          {stats && (
            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>Total Views</div>
                <div style={styles.statValue}>{stats.totalViews.toLocaleString()}</div>
                <div style={{ ...styles.statTrend, color: getTrendDisplay(stats.viewsTrend).color }}>
                  {getTrendDisplay(stats.viewsTrend).arrow} {getTrendDisplay(stats.viewsTrend).label} vs prev
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Searches</div>
                <div style={styles.statValue}>{stats.totalSearches.toLocaleString()}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Quiz Completions</div>
                <div style={styles.statValue}>{stats.totalQuizCompletions.toLocaleString()}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Ratings</div>
                <div style={styles.statValue}>{stats.totalRatings.toLocaleString()}</div>
                <div style={{ ...styles.statTrend, color: getTrendDisplay(stats.ratingsTrend).color }}>
                  {getTrendDisplay(stats.ratingsTrend).arrow} {getTrendDisplay(stats.ratingsTrend).label} vs prev
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Reviews</div>
                <div style={styles.statValue}>{stats.totalReviews.toLocaleString()}</div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Trip Reports</div>
                <div style={styles.statValue}>{stats.totalReports.toLocaleString()}</div>
              </div>

              {stats.avgRating && (
                <div style={styles.statCard}>
                  <div style={styles.statLabel}>Avg Rating</div>
                  <div style={styles.statValue}>
                    {stats.avgRating.toFixed(1)} <span style={styles.statStar}>★</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {trendData.length > 0 && (
            <div style={styles.chartSection}>
              <h2 style={styles.sectionTitle}>Views Trend</h2>
              <div style={styles.chart}>
                {trendData.map((point, i) => (
                  <div key={i} style={styles.chartBar}>
                    <div
                      style={{
                        ...styles.chartBarFill,
                        height: `${(point.views / maxViews) * 100}%`,
                      }}
                    />
                    <div style={styles.chartBarLabel}>
                      {new Date(point.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={styles.twoColumn}>
            <div style={styles.sectionCard}>
              <h2 style={styles.sectionTitle}>Top Strains</h2>
              {topStrains.length === 0 ? (
                <div style={styles.emptyState}>No strain data yet</div>
              ) : (
                <div style={styles.strainList}>
                  {topStrains.slice(0, 10).map((strain, i) => (
                    <div key={strain.strainSlug} style={styles.strainItem}>
                      <div style={styles.strainRank}>{i + 1}</div>
                      <div style={styles.strainInfo}>
                        <div style={styles.strainName}>{strain.strainSlug}</div>
                        <div style={styles.strainStats}>
                          {strain.views} views
                          {strain.ratings > 0 && ` • ${strain.ratings} ratings`}
                          {strain.avgRating && ` • ${strain.avgRating.toFixed(1)}★`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.sectionCard}>
              <h2 style={styles.sectionTitle}>Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <div style={styles.emptyState}>No recent activity</div>
              ) : (
                <div style={styles.activityList}>
                  {recentActivity.slice(0, 15).map((activity, i) => {
                    const display = getEventTypeDisplay(activity.eventType);
                    return (
                      <div key={i} style={styles.activityItem}>
                        <span style={{ ...styles.activityBadge, background: display.color }}>
                          {display.label}
                        </span>
                        <span style={styles.activityEntity}>{activity.entitySlug || "—"}</span>
                        <span style={styles.activityTime}>{formatDate(activity.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
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
  errorMessage: {
    background: "#fee2e2",
    color: "#991b1b",
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
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "1rem",
    marginBottom: "2rem",
  },
  statCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.25rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
  },
  statLabel: {
    fontSize: "0.75rem",
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "0.5rem",
  },
  statValue: {
    fontSize: "1.75rem",
    fontWeight: 600,
    color: "#111827",
  },
  statTrend: {
    fontSize: "0.75rem",
    marginTop: "0.25rem",
  },
  statStar: {
    color: "#f59e0b",
    fontSize: "1.25rem",
  },
  chartSection: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
    marginBottom: "2rem",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#374151",
    margin: "0 0 1rem",
  },
  chart: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.25rem",
    height: "150px",
    paddingTop: "1rem",
  },
  chartBar: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    height: "100%",
  },
  chartBarFill: {
    width: "100%",
    background: "linear-gradient(180deg, #6d28d9 0%, #a78bfa 100%)",
    borderRadius: "4px 4px 0 0",
    minHeight: "2px",
    marginTop: "auto",
  },
  chartBarLabel: {
    fontSize: "0.625rem",
    color: "#9ca3af",
    marginTop: "0.5rem",
    whiteSpace: "nowrap" as const,
  },
  twoColumn: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
    gap: "1.5rem",
  },
  sectionCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.5rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
  },
  emptyState: {
    color: "#9ca3af",
    fontStyle: "italic",
    padding: "1rem 0",
  },
  strainList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.75rem",
  },
  strainItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  strainRank: {
    width: "24px",
    height: "24px",
    background: "#f3f4f6",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#6b7280",
  },
  strainInfo: {
    flex: 1,
  },
  strainName: {
    fontWeight: 500,
    color: "#111827",
    fontSize: "0.875rem",
  },
  strainStats: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  activityList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.5rem",
  },
  activityItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    fontSize: "0.875rem",
  },
  activityBadge: {
    fontSize: "0.625rem",
    fontWeight: 500,
    padding: "0.125rem 0.5rem",
    borderRadius: "4px",
    color: "white",
    textTransform: "uppercase" as const,
  },
  activityEntity: {
    flex: 1,
    color: "#374151",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  activityTime: {
    color: "#9ca3af",
    fontSize: "0.75rem",
    whiteSpace: "nowrap" as const,
  },
};
