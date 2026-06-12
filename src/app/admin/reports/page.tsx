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

  const getDoseCategoryClasses = (category: string) => {
    const classes: Record<string, string> = {
      MICRODOSE: "bg-lichen-100 text-lichen-700",
      LOW: "bg-moss-100 text-moss-700",
      MODERATE: "bg-amber-100 text-amber-700",
      HIGH: "bg-amber-200 text-amber-800",
      HEROIC: "bg-clay-100 text-clay-700",
    };
    return classes[category] || "bg-bone-200 text-bark-600";
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Trip Reports" />

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
        <LoadingState label="Loading trip reports..." />
      ) : reports.length === 0 ? (
        <EmptyState
          icon="file"
          title={`No ${statusFilter === "all" ? "" : statusFilter} trip reports found.`}
        />
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          {reports.map((report) => (
            <Card key={report.id}>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-bark-800">{report.strainSlug}</span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase",
                    getDoseCategoryClasses(report.doseCategory)
                  )}
                >
                  {report.doseCategory} ({report.doseAmount})
                </span>
                <Badge tone={statusTone(report.status)} className="capitalize">
                  {report.status}
                </Badge>
                <span className="ml-auto text-xs text-bark-400">
                  {formatDate(report.createdAt)}
                </span>
              </div>

              <h3 className="mb-3 text-base font-semibold text-bark-700">{report.title}</h3>

              <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-bark-500">
                <span>
                  <strong>Setting:</strong> {report.setting}
                </span>
                {report.duration && (
                  <span>
                    <strong>Duration:</strong> {report.duration}
                  </span>
                )}
                {report.peakIntensity && (
                  <span>
                    <strong>Peak:</strong> {report.peakIntensity}/10
                  </span>
                )}
              </div>

              {report.intention && (
                <p className="mb-3 text-sm italic text-bark-500">
                  <strong>Intention:</strong> {report.intention}
                </p>
              )}

              <p
                className={cn(
                  "whitespace-pre-wrap text-sm leading-relaxed text-bark-600",
                  expandedReport !== report.id && "line-clamp-4"
                )}
              >
                {report.body}
              </p>

              {report.body.length > 300 && (
                <button
                  type="button"
                  onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
                  className="mt-1 cursor-pointer text-sm font-medium text-moss-700 underline underline-offset-2 hover:text-moss-800"
                >
                  {expandedReport === report.id ? "Show less" : "Show more"}
                </button>
              )}

              <div className="mt-4 flex flex-col gap-3 border-t border-bone-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-bark-400">
                  <span className="font-medium">Partner:</span> {report.partnerId}
                  {report.moderatedAt && (
                    <>
                      <span className="mx-2">•</span>
                      <span className="font-medium">Moderated:</span> {formatDate(report.moderatedAt)} by {report.moderatedBy}
                    </>
                  )}
                </div>

                {report.status === "pending" && (
                  <div className="flex gap-2 sm:shrink-0">
                    <Button
                      variant="primary"
                      className="flex-1 sm:flex-none"
                      onClick={() => handleModerate(report.id, "approved")}
                      loading={moderating === report.id}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger-ghost"
                      className="flex-1 sm:flex-none"
                      onClick={() => handleModerate(report.id, "rejected")}
                      loading={moderating === report.id}
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
