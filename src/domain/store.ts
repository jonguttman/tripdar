/**
 * Tripdar Signal Store
 * 
 * In-memory, append-only signal storage.
 * 
 * Per spec:
 * - Signals are append-only (never edited, merged, or replaced)
 * - Each signal is stored as an immutable, discrete unit
 * - No persistence required for prototype
 */

import { Signal, SignalInput, createSignal, validateSignal } from "./signal";

// =============================================================================
// STORE INTERFACE
// =============================================================================

export interface SignalStore {
  /**
   * Append a signal to the store.
   * Returns the created signal, or null if input is invalid.
   */
  append(input: SignalInput): Signal | null;

  /**
   * Get all signals in the store.
   * Returns a frozen copy to prevent external mutation.
   */
  getAll(): readonly Signal[];

  /**
   * Get the count of signals in the store.
   */
  count(): number;

  /**
   * Check if the store is empty.
   */
  isEmpty(): boolean;
}

// =============================================================================
// IN-MEMORY STORE IMPLEMENTATION
// =============================================================================

/**
 * Creates an in-memory signal store.
 * 
 * The store enforces:
 * - Append-only: no edit, delete, or replace operations
 * - Immutability: signals cannot be modified after creation
 * - Validation: only valid signals are stored
 */
export function createSignalStore(): SignalStore {
  // Internal storage - never exposed directly
  const signals: Signal[] = [];

  return {
    append(input: SignalInput): Signal | null {
      const signal = createSignal(input);
      
      if (signal === null) {
        return null;
      }

      // Validate the complete signal before storing
      const validation = validateSignal(signal);
      if (!validation.valid) {
        console.error("Signal validation failed:", validation.errors);
        return null;
      }

      // Append to store (immutable operation)
      signals.push(signal);
      
      return signal;
    },

    getAll(): readonly Signal[] {
      // Return a frozen shallow copy to prevent external mutation
      return Object.freeze([...signals]);
    },

    count(): number {
      return signals.length;
    },

    isEmpty(): boolean {
      return signals.length === 0;
    },
  };
}

// =============================================================================
// STORE QUERIES
// =============================================================================

/**
 * Filter signals by dimension.
 */
export function filterByDimension(
  signals: readonly Signal[],
  dimension: Signal["dimension"]
): readonly Signal[] {
  return signals.filter((s) => s.dimension === dimension);
}

/**
 * Filter signals by direction.
 */
export function filterByDirection(
  signals: readonly Signal[],
  direction: Signal["direction"]
): readonly Signal[] {
  return signals.filter((s) => s.direction === direction);
}

/**
 * Count signals by direction for a given dimension.
 */
export function countByDirection(
  signals: readonly Signal[],
  dimension: Signal["dimension"]
): Record<Signal["direction"], number> {
  const dimensionSignals = filterByDimension(signals, dimension);
  
  return {
    "More": dimensionSignals.filter((s) => s.direction === "More").length,
    "Less": dimensionSignals.filter((s) => s.direction === "Less").length,
    "Same": dimensionSignals.filter((s) => s.direction === "Same").length,
    "Not noticed": dimensionSignals.filter((s) => s.direction === "Not noticed").length,
  };
}

// =============================================================================
// IMMUTABILITY DEMONSTRATION
// =============================================================================

/**
 * Demonstrates that signals cannot be modified after creation.
 * This function is for testing/documentation purposes.
 */
export function demonstrateImmutability(): void {
  const store = createSignalStore();
  
  // Create a signal
  const signal = store.append({ dimension: "Clarity", direction: "More" });
  
  if (signal) {
    console.log("Original signal:", signal);
    
    // Attempting to modify the signal will fail at compile time
    // due to readonly properties. At runtime, strict mode will throw.
    try {
      // @ts-expect-error - Intentionally demonstrating immutability
      signal.direction = "Less";
      console.log("ERROR: Signal was mutated (this should not happen)");
    } catch {
      console.log("PASS: Signal is immutable (modification was prevented)");
    }
    
    // Attempting to modify the store's returned array will also fail
    const allSignals = store.getAll();
    try {
      // @ts-expect-error - Intentionally demonstrating immutability
      allSignals.push(signal);
      console.log("ERROR: Store array was mutated (this should not happen)");
    } catch {
      console.log("PASS: Store array is frozen (modification was prevented)");
    }
  }
}

