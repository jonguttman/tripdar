/**
 * Tripdar Signal Domain
 * 
 * A signal is the atomic unit of experiential data.
 * Every signal has exactly 4 required components:
 * - Context: Strain × Dose × Scale
 * - Dimension: One of the defined experiential dimensions
 * - Reference: What the comparison is against
 * - Direction: Which way the dimension moved
 * 
 * Signals are immutable once created.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Prototype constraint: Single strain only
 */
export type Strain = "Golden Teacher";

/**
 * Prototype constraint: Single dose only
 */
export type DoseCategory = "Microdose";

/**
 * Prototype constraint: Single scale only
 */
export type Scale = "Micro";

/**
 * Prototype constraint: Three dimensions only
 * - Clarity (Cognitive domain)
 * - Calm (Emotional domain)
 * - Presence (Cognitive domain)
 */
export type Dimension = "Clarity" | "Calm" | "Presence";

/**
 * Prototype constraint: Baseline reference only
 */
export type Reference = "Baseline";

/**
 * The four valid directions per spec.
 * "Not noticed" is a valid signal, not missing data.
 */
export type Direction = "More" | "Less" | "Same" | "Not noticed";

/**
 * Context is the "what" and "how much".
 * Context is immutable once recorded.
 */
export interface SignalContext {
  readonly strain: Strain;
  readonly dose: DoseCategory;
  readonly scale: Scale;
}

/**
 * A complete, valid Tripdar signal.
 * All fields are readonly to enforce immutability.
 */
export interface Signal {
  readonly id: string;
  readonly context: SignalContext;
  readonly dimension: Dimension;
  readonly reference: Reference;
  readonly direction: Direction;
  readonly createdAt: string;
}

/**
 * Input for creating a new signal.
 * Does not include id or createdAt (generated on creation).
 */
export interface SignalInput {
  readonly dimension: Dimension;
  readonly direction: Direction;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Fixed context for prototype.
 * Per implementation brief: one strain, one dose.
 */
export const FIXED_CONTEXT: SignalContext = {
  strain: "Golden Teacher",
  dose: "Microdose",
  scale: "Micro",
} as const;

/**
 * Fixed reference for prototype.
 * Per implementation brief: baseline only.
 */
export const FIXED_REFERENCE: Reference = "Baseline";

/**
 * Valid dimensions for prototype.
 */
export const VALID_DIMENSIONS: readonly Dimension[] = ["Clarity", "Calm", "Presence"] as const;

/**
 * Valid directions per spec.
 */
export const VALID_DIRECTIONS: readonly Direction[] = ["More", "Less", "Same", "Not noticed"] as const;

// =============================================================================
// VALIDATION
// =============================================================================

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates a signal input before creation.
 * Per spec: "If any check fails, no signal is recorded."
 */
export function validateSignalInput(input: SignalInput): ValidationResult {
  const errors: string[] = [];

  // Dimension must be from the defined set
  if (!VALID_DIMENSIONS.includes(input.dimension)) {
    errors.push(`Invalid dimension: ${input.dimension}. Must be one of: ${VALID_DIMENSIONS.join(", ")}`);
  }

  // Direction must be one of the four valid options
  if (!VALID_DIRECTIONS.includes(input.direction)) {
    errors.push(`Invalid direction: ${input.direction}. Must be one of: ${VALID_DIRECTIONS.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a complete signal.
 * Used to verify signals meet all spec requirements.
 */
export function validateSignal(signal: Signal): ValidationResult {
  const errors: string[] = [];

  // Context complete check
  if (!signal.context.strain) errors.push("Strain is required");
  if (!signal.context.dose) errors.push("Dose category is required");
  if (!signal.context.scale) errors.push("Scale is required");

  // Dimension valid check
  if (!VALID_DIMENSIONS.includes(signal.dimension)) {
    errors.push(`Invalid dimension: ${signal.dimension}`);
  }

  // Reference valid check (prototype: baseline only)
  if (signal.reference !== "Baseline") {
    errors.push(`Invalid reference: ${signal.reference}. Prototype supports Baseline only.`);
  }

  // Direction valid check
  if (!VALID_DIRECTIONS.includes(signal.direction)) {
    errors.push(`Invalid direction: ${signal.direction}`);
  }

  // Non-evaluative check: direction describes experience, not outcome
  // This is enforced by the type system (Direction union type)

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// SIGNAL CREATION
// =============================================================================

/**
 * Generates a unique signal ID.
 */
function generateSignalId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Creates a new signal from input.
 * Returns null if validation fails (per spec: no partial signals).
 */
export function createSignal(input: SignalInput): Signal | null {
  const validation = validateSignalInput(input);
  
  if (!validation.valid) {
    return null;
  }

  const signal: Signal = {
    id: generateSignalId(),
    context: FIXED_CONTEXT,
    dimension: input.dimension,
    reference: FIXED_REFERENCE,
    direction: input.direction,
    createdAt: new Date().toISOString(),
  };

  // Freeze the signal to enforce immutability at runtime
  return Object.freeze(signal);
}

/**
 * Creates a signal or throws if invalid.
 * Use when you need to handle errors explicitly.
 */
export function createSignalOrThrow(input: SignalInput): Signal {
  const validation = validateSignalInput(input);
  
  if (!validation.valid) {
    throw new Error(`Invalid signal input: ${validation.errors.join("; ")}`);
  }

  const signal: Signal = {
    id: generateSignalId(),
    context: FIXED_CONTEXT,
    dimension: input.dimension,
    reference: FIXED_REFERENCE,
    direction: input.direction,
    createdAt: new Date().toISOString(),
  };

  // Freeze the signal to enforce immutability at runtime
  return Object.freeze(signal);
}

