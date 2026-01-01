/**
 * Meaning Layer v1.0 — Application Guards
 *
 * These types mirror prisma/schema.prisma exactly (no extra fields).
 * No relations, no helper defaults, no derived fields.
 */

import type {
  Direction,
  DoseCategory,
  ExperienceScale,
  ReferenceFrame,
  DimensionId,
} from "./constants";

export interface SignalRecord {
  readonly id: string;
  readonly strainId: string;
  readonly doseCategory: DoseCategory;
  readonly scale: ExperienceScale;
  readonly dimensionId: DimensionId;
  readonly referenceFrame: ReferenceFrame;
  readonly comparisonDose: DoseCategory | null;
  readonly comparisonStrainId: string | null;
  readonly direction: Direction;
  readonly sessionId: string;
  readonly reportId: string;
  readonly createdAt: Date;
}

/**
 * Prisma Signal record as returned by the database.
 * Uses string types since SQLite doesn't have native enums.
 */
export interface PrismaSignalRecord {
  readonly id: string;
  readonly strainId: string;
  readonly doseCategory: string;
  readonly scale: string;
  readonly dimensionId: string;
  readonly referenceFrame: string;
  readonly comparisonDose: string | null;
  readonly comparisonStrainId: string | null;
  readonly direction: string;
  readonly sessionId: string;
  readonly reportId: string;
  readonly createdAt: Date;
}

/**
 * Minimal Prisma client surface used by this domain service.
 * (No relations, no indexes, no extra tables.)
 */
export interface PrismaClientLike {
  signal: {
    create: (args: { data: SignalRecord }) => Promise<PrismaSignalRecord>;
  };
}


