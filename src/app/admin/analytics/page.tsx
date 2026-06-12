"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  FilterTabs,
  LoadingState,
  PageHeader,
  type BadgeTone,
} from "@/components/admin";

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
      return { arrow: "↑", className: "text-moss-600", label: `+${trend}%` };
    } else if (trend < 0) {
      return { arrow: "↓", className: "text-clay-600", label: `${trend}%` };
    }
    return { arrow: "→", className: "text-bark-400", label: "0%" };
  };

  const getEventTypeDisplay = (eventType: string) => {
    const displays: Record<string, { label: string; tone: BadgeTone }> = {
      page_view: { label: "View", tone: "info" },
      search: { label: "Search", tone: "moss" },
      quiz_complete: { label: "Quiz", tone: "success" },
      rating: { label: "Rating", tone: "warning" },
      review: { label: "Review", tone: "info" },
      report: { label: "Report", tone: "danger" },
    };
    return displays[eventType] || { label: eventType, tone: "neutral" as BadgeTone };
  };

  const maxViews = Math.max(...trendData.map((d) => d.views), 1);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader title="Analytics" />

      {/* Period Filter */}
      <div className="mb-6">
        <span className="mb-2 block text-sm text-bark-400">Time period:</span>
        <FilterTabs
          tabs={[
            { value: "7d" as PeriodFilter, label: "7 Days" },
            { value: "30d" as PeriodFilter, label: "30 Days" },
            { value: "90d" as PeriodFilter, label: "90 Days" },
          ]}
          value={period}
          onChange={setPeriod}
        />
      </div>

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Loading analytics..." />
      ) : (
        <>
          {stats && (
            <div className="mb-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              <StatTile
                label="Total Views"
                value={stats.totalViews.toLocaleString()}
                trend={getTrendDisplay(stats.viewsTrend)}
              />
              <StatTile label="Searches" value={stats.totalSearches.toLocaleString()} />
              <StatTile
                label="Quiz Completions"
                value={stats.totalQuizCompletions.toLocaleString()}
              />
              <StatTile
                label="Ratings"
                value={stats.totalRatings.toLocaleString()}
                trend={getTrendDisplay(stats.ratingsTrend)}
              />
              <StatTile label="Reviews" value={stats.totalReviews.toLocaleString()} />
              <StatTile label="Trip Reports" value={stats.totalReports.toLocaleString()} />
              {stats.avgRating && (
                <StatTile
                  label="Avg Rating"
                  value={
                    <>
                      {stats.avgRating.toFixed(1)}{" "}
                      <span className="text-lg text-amber-400">★</span>
                    </>
                  }
                />
              )}
            </div>
          )}

          {trendData.length > 0 && (
            <Card className="mb-8">
              <h2 className="mb-4 text-base font-semibold text-bark-700">
                Views Trend
              </h2>
              <div className="h-[180px] overflow-hidden">
                <svg
                  viewBox={`0 0 ${trendData.length * 12} 120`}
                  preserveAspectRatio="none"
                  className="h-[150px] w-full overflow-visible"
                  role="img"
                  aria-label="Views trend bar chart"
                >
                  <defs>
                    <linearGradient id="viewsTrendBar" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#44602f" />
                      <stop offset="100%" stopColor="#9db786" />
                    </linearGradient>
                  </defs>
                  {trendData.map((point, i) => {
                    const barHeight = Math.max(2, (point.views / maxViews) * 100);
                    return (
                      <rect
                        key={point.date}
                        x={i * 12 + 2}
                        y={110 - barHeight}
                        width={8}
                        height={barHeight}
                        rx={2}
                        fill="url(#viewsTrendBar)"
                      />
                    );
                  })}
                </svg>
                <div className="flex gap-px sm:gap-1">
                  {trendData.map((point) => (
                    <div key={point.date} className="min-w-0 flex-1 truncate text-center text-[10px] text-bark-400">
                      {new Date(point.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 text-base font-semibold text-bark-700">
                Top Strains
              </h2>
              {topStrains.length === 0 ? (
                <EmptyState icon="leaf" title="No strain data yet" />
              ) : (
                <div className="flex flex-col gap-3">
                  {topStrains.slice(0, 10).map((strain, i) => (
                    <div key={strain.strainSlug} className="flex items-center gap-3">
                      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-bone-200 text-xs font-semibold text-bark-500">
                        {i + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-bark-800">
                          {strain.strainSlug}
                        </div>
                        <div className="text-xs text-bark-400">
                          {strain.views} views
                          {strain.ratings > 0 && ` • ${strain.ratings} ratings`}
                          {strain.avgRating && ` • ${strain.avgRating.toFixed(1)}★`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h2 className="mb-4 text-base font-semibold text-bark-700">
                Recent Activity
              </h2>
              {recentActivity.length === 0 ? (
                <EmptyState icon="chart" title="No recent activity" />
              ) : (
                <div className="flex flex-col gap-2">
                  {recentActivity.slice(0, 15).map((activity, i) => {
                    const display = getEventTypeDisplay(activity.eventType);
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <Badge tone={display.tone} className="shrink-0 uppercase">
                          {display.label}
                        </Badge>
                        <span className="min-w-0 flex-1 truncate text-bark-700">
                          {activity.entitySlug || "—"}
                        </span>
                        <span className="shrink-0 whitespace-nowrap text-xs text-bark-400">
                          {formatDate(activity.createdAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  trend,
}: {
  label: string;
  value: React.ReactNode;
  trend?: { arrow: string; className: string; label: string };
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-bark-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold text-bark-800 sm:text-2xl">
        {value}
      </div>
      {trend && (
        <div className={`mt-1 text-xs ${trend.className}`}>
          {trend.arrow} {trend.label} vs prev
        </div>
      )}
    </Card>
  );
}
