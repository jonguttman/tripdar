"use client";

import { useState, useEffect, useCallback } from "react";

interface TripReport {
  id: string;
  strainSlug: string;
  sessionHash: string;
  partnerId: string;
  doseAmount: string;
  doseCategory: string;
  setting: string;
  intention: string | null;
  title: string;
  body: string;
  duration: string | null;
  peakIntensity: number | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  moderatedAt: string | null;
  moderatedBy: string | null;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected";

export default function ReportsAdminPage() {
  const [reports, setReports] = useState<TripReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      const statusParam = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`/api/admin/reports${statusParam}`);
      const data = await res.json();

      if (data.success) {
        setReports(data.data.reports);
      } else {
        setError(data.error?.message || "Failed to load reports");
      }
    } catch {
      setError("Network error loading reports");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

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

  const handleModerate = async (reportId: string, newStatus: "approved" | "rejected") => {
    setModerating(reportId);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Report ${newStatus}`);
        setReports((prev) =>
          prev.map((r) =>
            r.id === reportId
              ? { ...r, status: newStatus, moderatedAt: new Date().toISOString() }
              : r
          )
        );
      } else {
        setError(data.error?.message || "Failed to moderate report");
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

  const getDoseCategoryStyle = (category: string) => {
    const colors: Record<string, { bg: string; color: string }> = {
      MICRODOSE: { bg: "#dbeafe", color: "#1e40af" },
      LOW: { bg: "#d1fae5", color: "#065f46" },
      MODERATE: { bg: "#fef3c7", color: "#92400e" },
      HIGH: { bg: "#fed7aa", color: "#9a3412" },
      HEROIC: { bg: "#fee2e2", color: "#991b1b" },
    };
    return colors[category] || { bg: "#e5e7eb", color: "#374151" };
  };

  const getStatusStyle = (reportStatus: string) => {
    switch (reportStatus) {
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
        <h1 style={styles.title}>Trip Reports</h1>
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
        <div style={styles.loading}>Loading trip reports...</div>
      ) : reports.length === 0 ? (
        <div style={styles.emptyState}>
          No {statusFilter === "all" ? "" : statusFilter} trip reports found.
        </div>
      ) : (
        <div style={styles.reportsList}>
          {reports.map((report) => (
            <div key={report.id} style={styles.reportCard}>
              <div style={styles.reportHeader}>
                <div style={styles.reportMeta}>
                  <span style={styles.strainSlug}>{report.strainSlug}</span>
                  <span style={{ ...styles.doseBadge, ...getDoseCategoryStyle(report.doseCategory) }}>
                    {report.doseCategory} ({report.doseAmount})
                  </span>
                  <span style={{ ...styles.statusBadge, ...getStatusStyle(report.status) }}>
                    {report.status}
                  </span>
                </div>
                <span style={styles.reportDate}>{formatDate(report.createdAt)}</span>
              </div>

              <h3 style={styles.reportTitle}>{report.title}</h3>

              <div style={styles.reportDetails}>
                <span style={styles.detailItem}>
                  <strong>Setting:</strong> {report.setting}
                </span>
                {report.duration && (
                  <span style={styles.detailItem}>
                    <strong>Duration:</strong> {report.duration}
                  </span>
                )}
                {report.peakIntensity && (
                  <span style={styles.detailItem}>
                    <strong>Peak:</strong> {report.peakIntensity}/10
                  </span>
                )}
              </div>

              {report.intention && (
                <p style={styles.reportIntention}>
                  <strong>Intention:</strong> {report.intention}
                </p>
              )}

              <p
                style={{
                  ...styles.reportBody,
                  ...(expandedReport === report.id ? {} : { maxHeight: "6em", overflow: "hidden" }),
                }}
              >
                {report.body}
              </p>

              {report.body.length > 300 && (
                <button
                  onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                  style={styles.linkButton}
                >
                  {expandedReport === report.id ? "Show less" : "Show more"}
                </button>
              )}

              <div style={styles.reportFooter}>
                <div style={styles.reportInfo}>
                  <span style={styles.infoLabel}>Partner:</span> {report.partnerId}
                  {report.moderatedAt && (
                    <>
                      <span style={styles.infoDivider}>•</span>
                      <span style={styles.infoLabel}>Moderated:</span> {formatDate(report.moderatedAt)} by {report.moderatedBy}
                    </>
                  )}
                </div>

                {report.status === "pending" && (
                  <div style={styles.actionButtons}>
                    <button
                      onClick={() => handleModerate(report.id, "approved")}
                      disabled={moderating === report.id}
                      style={styles.approveButton}
                    >
                      {moderating === report.id ? "..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleModerate(report.id, "rejected")}
                      disabled={moderating === report.id}
                      style={styles.rejectButton}
                    >
                      {moderating === report.id ? "..." : "Reject"}
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
  reportsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1rem",
  },
  reportCard: {
    background: "white",
    borderRadius: "12px",
    padding: "1.25rem",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
    border: "1px solid #e5e7eb",
  },
  reportHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.75rem",
    flexWrap: "wrap" as const,
    gap: "0.5rem",
  },
  reportMeta: {
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
  doseBadge: {
    fontSize: "0.7rem",
    fontWeight: 500,
    padding: "0.25rem 0.5rem",
    borderRadius: "4px",
    textTransform: "uppercase" as const,
  },
  statusBadge: {
    fontSize: "0.75rem",
    fontWeight: 500,
    padding: "0.25rem 0.75rem",
    borderRadius: "12px",
    textTransform: "capitalize" as const,
  },
  reportDate: {
    fontSize: "0.75rem",
    color: "#9ca3af",
  },
  reportTitle: {
    margin: "0 0 0.75rem",
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#374151",
  },
  reportDetails: {
    display: "flex",
    gap: "1rem",
    marginBottom: "0.75rem",
    flexWrap: "wrap" as const,
  },
  detailItem: {
    fontSize: "0.875rem",
    color: "#6b7280",
  },
  reportIntention: {
    fontSize: "0.875rem",
    color: "#6b7280",
    fontStyle: "italic",
    margin: "0 0 0.75rem",
  },
  reportBody: {
    margin: 0,
    fontSize: "0.875rem",
    color: "#4b5563",
    lineHeight: 1.6,
    whiteSpace: "pre-wrap" as const,
  },
  reportFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "1rem",
    paddingTop: "1rem",
    borderTop: "1px solid #f3f4f6",
    flexWrap: "wrap" as const,
    gap: "0.75rem",
  },
  reportInfo: {
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
