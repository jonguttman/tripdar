"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Badge,
  Card,
  Icon,
  LoadingState,
  PageHeader,
  StatCard,
  statusTone,
} from "@/components/admin";

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
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <LoadingState label="Loading dashboard..." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Dashboard"
        subtitle="Welcome to the Tripdar admin dashboard"
      />

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <StatCard
          href="/admin/strains"
          icon="leaf"
          value={stats?.strains || 0}
          label="Strains"
          tone="moss"
        />
        <StatCard
          href="/admin/collections"
          icon="folder"
          value={stats?.collections || 0}
          label="Collections"
          tone="lichen"
        />
        <StatCard
          href="/admin/reviews?status=pending"
          icon="star"
          value={stats?.pendingReviews || 0}
          label="Pending Reviews"
          tone={stats?.pendingReviews ? "amber" : "moss"}
        />
        <StatCard
          href="/admin/reports?status=pending"
          icon="file"
          value={stats?.pendingReports || 0}
          label="Pending Reports"
          tone={stats?.pendingReports ? "amber" : "moss"}
        />
      </div>

      {/* Quick Actions */}
      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-bark-700">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <QuickAction
            href="/admin/strains"
            icon="plus"
            tone="moss"
            title="Add Strain"
            description="Create a new strain entry"
          />
          <QuickAction
            href="/admin/collections"
            icon="plus"
            tone="moss"
            title="Create Collection"
            description="Group strains into a collection"
          />
          <QuickAction
            href="/admin/analytics"
            icon="chart"
            tone="lichen"
            title="View Analytics"
            description="See usage statistics"
          />
          <QuickAction
            href="/admin/partners"
            icon="users"
            tone="clay"
            title="Manage Partners"
            description="API keys and access"
          />
        </div>
      </section>

      {/* Recent Activity */}
      {recentItems.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-base font-semibold text-bark-700">
            Recent Submissions
          </h2>
          <Card padded={false} className="divide-y divide-bone-200 overflow-hidden">
            {recentItems.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                href={`/admin/${item.type === "review" ? "reviews" : "reports"}`}
                className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm transition-colors hover:bg-bone-100"
              >
                <Badge tone={item.type === "review" ? "info" : "neutral"}>
                  {item.type}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-medium text-bark-700">
                  {item.strainSlug}
                </span>
                <Badge tone={statusTone(item.status)} className="capitalize">
                  {item.status}
                </Badge>
                <span className="text-xs text-bark-400">
                  {formatDate(item.createdAt)}
                </span>
              </Link>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function QuickAction({
  href,
  icon,
  tone,
  title,
  description,
}: {
  href: string;
  icon: "plus" | "chart" | "users";
  tone: "moss" | "lichen" | "clay";
  title: string;
  description: string;
}) {
  const toneClasses = {
    moss: "bg-moss-100 text-moss-600",
    lichen: "bg-lichen-100 text-lichen-600",
    clay: "bg-clay-100 text-clay-600",
  };
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-xl border border-bone-300 bg-bone-50 p-4 shadow-sm transition-colors hover:border-moss-300"
    >
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-bark-800">
          {title}
        </span>
        <span className="block truncate text-xs text-bark-400">
          {description}
        </span>
      </span>
    </Link>
  );
}
