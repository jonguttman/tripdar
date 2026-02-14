"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface DashboardStats {
  strains: number;
  collections: number;
  pendingReviews: number;
  pendingReports: number;
  totalRatings: number;
  avgRating: number | null;
}

interface RecentItem {
  type: "review" | "report";
  id: string;
  strainSlug: string;
  status: string;
  createdAt: string;
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Load stats from various endpoints
        const [strainsRes, collectionsRes, reviewsRes, reportsRes] = await Promise.all([
          fetch("/api/admin/strains"),
          fetch("/api/admin/collections"),
          fetch("/api/admin/reviews?status=pending&pageSize=5"),
          fetch("/api/admin/reports?status=pending&pageSize=5"),
        ]);

        const [strainsData, collectionsData, reviewsData, reportsData] = await Promise.all([
          strainsRes.json(),
          collectionsRes.json(),
          reviewsRes.json(),
          reportsRes.json(),
        ]);

        setStats({
          strains: strainsData.success ? strainsData.data.strains.length : 0,
          collections: collectionsData.success ? collectionsData.data.collections.length : 0,
          pendingReviews: reviewsData.success ? reviewsData.data.pagination.total : 0,
          pendingReports: reportsData.success ? reportsData.data.pagination.total : 0,
          totalRatings: 0,
          avgRating: null,
        });

        // Combine recent items
        const recent: RecentItem[] = [];

        if (reviewsData.success) {
          reviewsData.data.reviews.forEach((r: { id: string; strainSlug: string; status: string; createdAt: string }) => {
            recent.push({
              type: "review",
              id: r.id,
              strainSlug: r.strainSlug,
              status: r.status,
              createdAt: r.createdAt,
            });
          });
        }

        if (reportsData.success) {
          reportsData.data.reports.forEach((r: { id: string; strainSlug: string; status: string; createdAt: string }) => {
            recent.push({
              type: "report",
              id: r.id,
              strainSlug: r.strainSlug,
              status: r.status,
              createdAt: r.createdAt,
            });
          });
        }

        // Sort by date
        recent.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setRecentItems(recent.slice(0, 10));
      } catch (error) {
        console.error("Error loading dashboard:", error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Dashboard</h1>
        <p style={styles.subtitle}>Welcome to the Tripdar admin dashboard</p>
      </div>

      {/* Quick Stats */}
      <div style={styles.statsGrid}>
        <Link href="/admin/strains" style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1.5 0 3-.3 4.3-.9" />
              <path d="M12 2c3 3 5 7.5 5 12 0 1.5-.3 3-.9 4.3" />
              <path d="M12 2v20" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats?.strains || 0}</div>
            <div style={styles.statLabel}>Strains</div>
          </div>
        </Link>

        <Link href="/admin/collections" style={styles.statCard}>
          <div style={styles.statIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats?.collections || 0}</div>
            <div style={styles.statLabel}>Collections</div>
          </div>
        </Link>

        <Link href="/admin/reviews?status=pending" style={styles.statCard}>
          <div style={{ ...styles.statIcon, background: stats?.pendingReviews ? "#fef3c7" : "#f0fdf4" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stats?.pendingReviews ? "#f59e0b" : "#10b981"} strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats?.pendingReviews || 0}</div>
            <div style={styles.statLabel}>Pending Reviews</div>
          </div>
        </Link>

        <Link href="/admin/reports?status=pending" style={styles.statCard}>
          <div style={{ ...styles.statIcon, background: stats?.pendingReports ? "#fef3c7" : "#f0fdf4" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={stats?.pendingReports ? "#f59e0b" : "#10b981"} strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <div style={styles.statContent}>
            <div style={styles.statValue}>{stats?.pendingReports || 0}</div>
            <div style={styles.statLabel}>Pending Reports</div>
          </div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div style={styles.actionsGrid}>
          <Link href="/admin/strains" style={styles.actionCard}>
            <div style={styles.actionIcon}>+</div>
            <div>
              <div style={styles.actionTitle}>Add Strain</div>
              <div style={styles.actionDesc}>Create a new strain entry</div>
            </div>
          </Link>
          <Link href="/admin/collections" style={styles.actionCard}>
            <div style={styles.actionIcon}>+</div>
            <div>
              <div style={styles.actionTitle}>Create Collection</div>
              <div style={styles.actionDesc}>Group strains into a collection</div>
            </div>
          </Link>
          <Link href="/admin/analytics" style={styles.actionCard}>
            <div style={{ ...styles.actionIcon, background: "#dbeafe", color: "#3b82f6" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </div>
            <div>
              <div style={styles.actionTitle}>View Analytics</div>
              <div style={styles.actionDesc}>See usage statistics</div>
            </div>
          </Link>
          <Link href="/admin/partners" style={styles.actionCard}>
            <div style={{ ...styles.actionIcon, background: "#fce7f3", color: "#ec4899" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div style={styles.actionTitle}>Manage Partners</div>
              <div style={styles.actionDesc}>API keys and access</div>
            </div>
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      {recentItems.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Recent Submissions</h2>
          <div style={styles.activityList}>
            {recentItems.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={`/admin/${item.type === "review" ? "reviews" : "reports"}`}
                style={styles.activityItem}
              >
                <span style={{
                  ...styles.activityBadge,
                  background: item.type === "review" ? "#dbeafe" : "#fce7f3",
                  color: item.type === "review" ? "#3b82f6" : "#ec4899",
                }}>
                  {item.type}
                </span>
                <span style={styles.activityStrain}>{item.strainSlug}</span>
                <span style={{
                  ...styles.statusBadge,
                  background: item.status === "pending" ? "#fef3c7" : item.status === "approved" ? "#d1fae5" : "#fee2e2",
                  color: item.status === "pending" ? "#92400e" : item.status === "approved" ? "#065f46" : "#991b1b",
                }}>
                  {item.status}
                </span>
                <span style={styles.activityTime}>{formatDate(item.createdAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "2rem",
    maxWidth: "1200px",
  },
  header: {
    marginBottom: "2rem",
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
  loading: {
    textAlign: "center",
    padding: "3rem",
    color: "#6b7280",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
    marginBottom: "2rem",
  },
  statCard: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "1.25rem",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
    textDecoration: "none",
    transition: "box-shadow 0.15s ease",
  },
  statIcon: {
    width: "48px",
    height: "48px",
    borderRadius: "12px",
    background: "#f0fdf4",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  statContent: {},
  statValue: {
    fontSize: "1.5rem",
    fontWeight: 600,
    color: "#111827",
  },
  statLabel: {
    fontSize: "0.75rem",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  section: {
    marginBottom: "2rem",
  },
  sectionTitle: {
    fontSize: "1rem",
    fontWeight: 600,
    color: "#374151",
    margin: "0 0 1rem",
  },
  actionsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "1rem",
  },
  actionCard: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    padding: "1rem 1.25rem",
    background: "white",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    textDecoration: "none",
    transition: "border-color 0.15s ease",
  },
  actionIcon: {
    width: "36px",
    height: "36px",
    borderRadius: "8px",
    background: "#f0fdf4",
    color: "#10b981",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.25rem",
    fontWeight: 600,
  },
  actionTitle: {
    fontWeight: 500,
    color: "#111827",
    fontSize: "0.875rem",
  },
  actionDesc: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  activityList: {
    display: "flex",
    flexDirection: "column",
    background: "white",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  },
  activityItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #f3f4f6",
    textDecoration: "none",
    fontSize: "0.875rem",
  },
  activityBadge: {
    fontSize: "0.625rem",
    fontWeight: 600,
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    textTransform: "uppercase",
  },
  activityStrain: {
    flex: 1,
    color: "#374151",
    fontWeight: 500,
  },
  statusBadge: {
    fontSize: "0.625rem",
    fontWeight: 500,
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    textTransform: "capitalize",
  },
  activityTime: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
};
