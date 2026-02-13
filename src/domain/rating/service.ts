/**
 * Community Ratings & Reviews Service
 *
 * Handles all operations for strain ratings and reviews.
 */

import { prisma } from "@/lib/prisma";
import {
  CreateRatingInput,
  CreateReviewInput,
  ModerateReviewInput,
  PublicReview,
  RatingAggregation,
  StrainRating,
  StrainReview,
  ReviewStatus,
} from "./types";

/**
 * Create a new rating for a strain
 */
export async function createRating(
  input: CreateRatingInput
): Promise<StrainRating> {
  // Validate rating range
  if (input.rating < 1 || input.rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  const rating = await prisma.strainRating.create({
    data: {
      strainSlug: input.strainSlug,
      rating: input.rating,
      sessionHash: input.sessionHash,
      partnerId: input.partnerId,
    },
  });

  return rating as StrainRating;
}

/**
 * Get rating aggregation for a strain
 */
export async function getRatingAggregation(
  strainSlug: string
): Promise<RatingAggregation> {
  const ratings = await prisma.strainRating.findMany({
    where: { strainSlug },
    select: { rating: true },
  });

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;

  for (const r of ratings) {
    distribution[r.rating as 1 | 2 | 3 | 4 | 5]++;
    total += r.rating;
  }

  return {
    strainSlug,
    averageRating: ratings.length > 0 ? total / ratings.length : 0,
    totalRatings: ratings.length,
    distribution,
  };
}

/**
 * Create a new review for a strain (goes into moderation queue)
 */
export async function createReview(
  input: CreateReviewInput
): Promise<StrainReview> {
  // Validate rating range
  if (input.rating < 1 || input.rating > 5) {
    throw new Error("Rating must be between 1 and 5");
  }

  // Validate body length
  if (input.body.length < 10) {
    throw new Error("Review body must be at least 10 characters");
  }

  if (input.body.length > 2000) {
    throw new Error("Review body must be less than 2000 characters");
  }

  const review = await prisma.strainReview.create({
    data: {
      strainSlug: input.strainSlug,
      rating: input.rating,
      title: input.title || null,
      body: input.body,
      sessionHash: input.sessionHash,
      partnerId: input.partnerId,
      status: "pending",
    },
  });

  return review as StrainReview;
}

/**
 * Get approved reviews for a strain
 */
export async function getApprovedReviews(
  strainSlug: string,
  limit: number = 10,
  offset: number = 0
): Promise<{ reviews: PublicReview[]; total: number }> {
  const [reviews, total] = await Promise.all([
    prisma.strainReview.findMany({
      where: { strainSlug, status: "approved" },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        strainSlug: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
      },
    }),
    prisma.strainReview.count({
      where: { strainSlug, status: "approved" },
    }),
  ]);

  return {
    reviews: reviews.map((r: typeof reviews[number]) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
  };
}

/**
 * Get all reviews for moderation (admin only)
 */
export async function getReviewsForModeration(
  status?: ReviewStatus,
  limit: number = 50,
  offset: number = 0
): Promise<{ reviews: StrainReview[]; total: number }> {
  const where = status ? { status } : {};

  const [reviews, total] = await Promise.all([
    prisma.strainReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.strainReview.count({ where }),
  ]);

  return {
    reviews: reviews as StrainReview[],
    total,
  };
}

/**
 * Moderate a review (approve or reject)
 */
export async function moderateReview(
  input: ModerateReviewInput
): Promise<StrainReview> {
  const review = await prisma.strainReview.update({
    where: { id: input.reviewId },
    data: {
      status: input.status,
      moderatedAt: new Date(),
      moderatedBy: input.moderatorId,
    },
  });

  return review as StrainReview;
}

/**
 * Get a single review by ID
 */
export async function getReviewById(
  id: string
): Promise<StrainReview | null> {
  const review = await prisma.strainReview.findUnique({
    where: { id },
  });

  return review as StrainReview | null;
}

/**
 * Check if a session has already rated a strain
 */
export async function hasSessionRatedStrain(
  sessionHash: string,
  strainSlug: string
): Promise<boolean> {
  const rating = await prisma.strainRating.findFirst({
    where: { sessionHash, strainSlug },
  });

  return rating !== null;
}

/**
 * Check if a session has already reviewed a strain
 */
export async function hasSessionReviewedStrain(
  sessionHash: string,
  strainSlug: string
): Promise<boolean> {
  const review = await prisma.strainReview.findFirst({
    where: { sessionHash, strainSlug },
  });

  return review !== null;
}
