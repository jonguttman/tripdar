"use client";

import { useState, useEffect } from "react";
import {
  Alert,
  Card,
  EmptyState,
  LoadingState,
  PageHeader,
} from "@/components/admin";

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
        <span key={`full-${i}`} className="text-amber-500">
          ★
        </span>
      );
    }

    if (hasHalfStar) {
      stars.push(
        <span key="half" className="text-amber-500">
          ★
        </span>
      );
    }

    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <span key={`empty-${i}`} className="text-bone-300">
          ★
        </span>
      );
    }

    return stars;
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-8">
      <PageHeader
        title="Strain Ratings"
        subtitle={`${ratings.length} strains have received ratings`}
      />

      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Loading ratings..." />
      ) : ratings.length === 0 ? (
        <EmptyState
          icon="star"
          title="No ratings yet"
          description="Ratings will appear here when users submit feedback via partner sites"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {ratings.map((strain) => (
            <Card key={strain.strainSlug}>
              <div className="mb-3 flex items-start justify-between gap-2">
                <h3 className="min-w-0 flex-1 break-words text-lg font-semibold text-bark-800">
                  {strain.strainSlug}
                </h3>
                <span className="shrink-0 rounded-full bg-amber-500 px-2.5 py-0.5 text-sm font-semibold text-bone-50">
                  {strain.avgRating.toFixed(1)}
                </span>
              </div>

              <div className="mb-4 flex gap-0.5 text-2xl leading-none">
                {renderStars(strain.avgRating)}
              </div>

              <div className="flex flex-col gap-2 border-t border-bone-200 pt-4 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-bark-400">Ratings:</span>
                  <span className="font-medium text-bark-800">{strain.ratingCount}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-bark-400">Latest:</span>
                  <span className="text-right font-medium text-bark-800">
                    {formatDate(strain.latestRatingAt)}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
