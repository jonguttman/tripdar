import {
  CANONICAL_DOSE_LEVELS,
  DOSE_SENSITIVITY_MODIFIERS,
  type DoseSensitivity,
} from "../recommendation-engine/types";

/**
 * Generate a unique dosing guide token.
 * Format: dg_ + 12 random alphanumeric chars.
 */
export function generateDosingGuideToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "dg_";
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Round milligrams to the nearest 0.25g boundary, return as mg.
 */
function roundToQuarterGram(mg: number): number {
  return (Math.round((mg / 1000) * 4) / 4) * 1000;
}

/**
 * Format a dose range for display on the dose card.
 * - Level 1 (Microdose): mg only
 * - Levels 2-6: grams primary (rounded to 0.25g), mg secondary
 */
export function formatDoseForCard(
  level: number,
  lowMg: number,
  highMg: number
): { primary: string; secondary: string | null } {
  if (level === 1) {
    return {
      primary: `${lowMg}-${highMg} mg`,
      secondary: null,
    };
  }

  const roundedLowMg = roundToQuarterGram(lowMg);
  const roundedHighMg = roundToQuarterGram(highMg);
  const lowG = roundedLowMg / 1000;
  const highG = roundedHighMg / 1000;

  return {
    primary: `${lowG}-${highG} g`,
    secondary: `${roundedLowMg}-${roundedHighMg} mg`,
  };
}

export interface DoseRangeForCard {
  level: number;
  name: string;
  lowMg: number;
  highMg: number;
  descriptors: string[];
  display: { primary: string; secondary: string | null };
}

/**
 * Calculate all 6 dose ranges for a given sensitivity, formatted for the dose card.
 */
export function calculateAllDoseRanges(
  sensitivity: DoseSensitivity
): DoseRangeForCard[] {
  const modifier = DOSE_SENSITIVITY_MODIFIERS[sensitivity];

  return CANONICAL_DOSE_LEVELS.map((level) => {
    const lowMg = Math.round(level.standardLowMg * modifier);
    const highMg = Math.round(level.standardHighMg * modifier);

    return {
      level: level.level,
      name: level.name,
      lowMg,
      highMg,
      descriptors: level.descriptors,
      display: formatDoseForCard(level.level, lowMg, highMg),
    };
  });
}
