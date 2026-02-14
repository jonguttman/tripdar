/**
 * Community Ratings & Reviews Types
 */

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface StrainRating {
  id: string;
  strainSlug: string;
  rating: number; // 1-5
  sessionHash: string;
  partnerId: string;
  createdAt: Date;
}

export interface StrainReview {
  id: string;
  strainSlug: string;
  rating: number; // 1-5
  title: string | null;
  body: string;
  sessionHash: string;
  partnerId: string;
  status: ReviewStatus;
  createdAt: Date;
  moderatedAt: Date | null;
  moderatedBy: string | null;
}

export interface RatingAggregation {
  strainSlug: string;
  averageRating: number;
  totalRatings: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface CreateRatingInput {
  strainSlug: string;
  rating: number;
  sessionHash: string;
  partnerId: string;
}

export interface CreateReviewInput {
  strainSlug: string;
  rating: number;
  title?: string;
  body: string;
  sessionHash: string;
  partnerId: string;
}

export interface ModerateReviewInput {
  reviewId: string;
  status: "approved" | "rejected";
  moderatorId: string;
}

// Public view of a review (approved only, no session/partner info)
export interface PublicReview {
  id: string;
  strainSlug: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: string; // ISO string
}
