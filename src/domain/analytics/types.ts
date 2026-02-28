/**
 * Analytics Domain Types
 */

export type EventType =
  | "page_view"
  | "quiz_complete"
  | "search"
  | "rating"
  | "review"
  | "report"
  | "strain_tried"
  | "strain_view"
  | "dosing_guide_created"
  | "dosing_guide_downloaded";

export type Period = "daily" | "weekly" | "monthly";

export interface AnalyticsEvent {
  id: string;
  eventType: EventType;
  entitySlug: string | null;
  partnerId: string;
  sessionHash: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateEventInput {
  eventType: EventType;
  entitySlug?: string;
  partnerId: string;
  sessionHash: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsSummary {
  id: string;
  period: Period;
  periodStart: Date;
  strainSlug: string; // empty string for overall summary
  views: number;
  searches: number;
  quizCompletions: number;
  ratings: number;
  reviews: number;
  reports: number;
  avgRating: number | null;
}

export interface OverviewStats {
  period: string;
  totalViews: number;
  totalSearches: number;
  totalQuizCompletions: number;
  totalRatings: number;
  totalReviews: number;
  totalReports: number;
  avgRating: number | null;
  viewsTrend: number; // percentage change from previous period
  ratingsTrend: number;
}

export interface StrainStats {
  strainSlug: string;
  views: number;
  ratings: number;
  reviews: number;
  reports: number;
  avgRating: number | null;
}

export interface TrendDataPoint {
  date: string;
  views: number;
  ratings: number;
  reviews: number;
  reports: number;
}

export interface AnalyticsOverviewResponse {
  period: string;
  stats: OverviewStats;
  topStrains: StrainStats[];
  recentActivity: {
    eventType: EventType;
    entitySlug: string | null;
    createdAt: string;
  }[];
}

export interface AnalyticsTrendsResponse {
  period: string;
  dataPoints: TrendDataPoint[];
}
