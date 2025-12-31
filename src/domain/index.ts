/**
 * Tripdar Domain Layer
 * 
 * This file demonstrates compliant signal capture and aggregation.
 * Run with: npx ts-node src/domain/index.ts
 * 
 * Demonstrates:
 * 1. Signal creation and validation
 * 2. Append-only store behavior
 * 3. Immutability enforcement
 * 4. Aggregation producing compliant pattern language
 */

import type { Signal, SignalInput, Dimension, Direction } from "./signal";
import {
  createSignal,
  createSignalOrThrow,
  validateSignalInput,
  FIXED_CONTEXT,
  FIXED_REFERENCE,
  VALID_DIMENSIONS,
  VALID_DIRECTIONS,
} from "./signal";

import type { SignalStore } from "./store";
import {
  createSignalStore,
  filterByDimension,
  countByDirection,
} from "./store";

import {
  aggregateDimension,
  aggregateAll,
  checkCompliance,
  verifyAggregationCompliance,
} from "./aggregation";

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

function runExample(): void {
  console.log("=".repeat(70));
  console.log("TRIPDAR DOMAIN LAYER - EXAMPLE USAGE");
  console.log("=".repeat(70));
  console.log();

  // -------------------------------------------------------------------------
  // 1. SIGNAL CREATION AND VALIDATION
  // -------------------------------------------------------------------------
  console.log("1. SIGNAL CREATION AND VALIDATION");
  console.log("-".repeat(70));
  console.log();

  console.log("Fixed context (per implementation brief):");
  console.log(`  Strain: ${FIXED_CONTEXT.strain}`);
  console.log(`  Dose: ${FIXED_CONTEXT.dose}`);
  console.log(`  Scale: ${FIXED_CONTEXT.scale}`);
  console.log(`  Reference: ${FIXED_REFERENCE}`);
  console.log();

  console.log("Valid dimensions:", VALID_DIMENSIONS.join(", "));
  console.log("Valid directions:", VALID_DIRECTIONS.join(", "));
  console.log();

  // Valid signal creation
  const validInput: SignalInput = { dimension: "Clarity", direction: "More" };
  const validationResult = validateSignalInput(validInput);
  console.log("Validating input:", validInput);
  console.log("  Valid:", validationResult.valid);
  console.log();

  // Invalid signal creation (wrong dimension)
  const invalidInput = { dimension: "Focus" as any, direction: "More" as any };
  const invalidResult = validateSignalInput(invalidInput);
  console.log("Validating invalid input:", invalidInput);
  console.log("  Valid:", invalidResult.valid);
  console.log("  Errors:", invalidResult.errors);
  console.log();

  // -------------------------------------------------------------------------
  // 2. APPEND-ONLY STORE
  // -------------------------------------------------------------------------
  console.log("2. APPEND-ONLY STORE");
  console.log("-".repeat(70));
  console.log();

  const store = createSignalStore();
  console.log("Created empty store. Count:", store.count());
  console.log();

  // Append signals
  const signals: Signal[] = [];
  
  // Simulate multiple users reporting on Clarity
  signals.push(store.append({ dimension: "Clarity", direction: "More" })!);
  signals.push(store.append({ dimension: "Clarity", direction: "More" })!);
  signals.push(store.append({ dimension: "Clarity", direction: "More" })!);
  signals.push(store.append({ dimension: "Clarity", direction: "Less" })!);
  signals.push(store.append({ dimension: "Clarity", direction: "Same" })!);
  
  // Simulate multiple users reporting on Calm
  signals.push(store.append({ dimension: "Calm", direction: "More" })!);
  signals.push(store.append({ dimension: "Calm", direction: "More" })!);
  signals.push(store.append({ dimension: "Calm", direction: "Same" })!);
  
  // Simulate multiple users reporting on Presence
  signals.push(store.append({ dimension: "Presence", direction: "More" })!);
  signals.push(store.append({ dimension: "Presence", direction: "More" })!);
  signals.push(store.append({ dimension: "Presence", direction: "More" })!);
  signals.push(store.append({ dimension: "Presence", direction: "More" })!);

  console.log(`Appended ${store.count()} signals to store.`);
  console.log();

  // Show signal structure
  console.log("Example signal structure:");
  const exampleSignal = store.getAll()[0];
  console.log(JSON.stringify(exampleSignal, null, 2));
  console.log();

  // -------------------------------------------------------------------------
  // 3. IMMUTABILITY DEMONSTRATION
  // -------------------------------------------------------------------------
  console.log("3. IMMUTABILITY DEMONSTRATION");
  console.log("-".repeat(70));
  console.log();

  console.log("Signals are immutable. Attempting to modify will fail:");
  console.log();

  const signalToModify = store.getAll()[0];
  console.log("Original direction:", signalToModify.direction);
  
  try {
    // @ts-expect-error - Intentionally demonstrating immutability
    signalToModify.direction = "Less";
    // In strict mode this would throw. In non-strict, it silently fails.
    console.log("  After attempted modification:", signalToModify.direction);
    console.log("  (In strict mode, this would throw TypeError)");
  } catch (e) {
    console.log("  ✓ Modification prevented:", (e as Error).message);
  }
  console.log();

  console.log("Store array is frozen. Attempting to push will fail:");
  const allSignals = store.getAll();
  try {
    // @ts-expect-error - Intentionally demonstrating immutability
    allSignals.push(exampleSignal);
    console.log("  ERROR: Array was mutated");
  } catch (e) {
    console.log("  ✓ Array frozen:", (e as Error).message);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 4. AGGREGATION - PATTERN LANGUAGE OUTPUT
  // -------------------------------------------------------------------------
  console.log("4. AGGREGATION - PATTERN LANGUAGE OUTPUT");
  console.log("-".repeat(70));
  console.log();

  // Aggregate each dimension
  for (const dimension of VALID_DIMENSIONS) {
    const dimSignals = filterByDimension(store.getAll(), dimension);
    const counts = countByDirection(store.getAll(), dimension);
    const aggregation = aggregateDimension(store.getAll(), dimension);

    console.log(`${dimension.toUpperCase()}`);
    console.log(`  Signals: ${dimSignals.length}`);
    console.log(`  Counts: More=${counts["More"]}, Less=${counts["Less"]}, Same=${counts["Same"]}, Not noticed=${counts["Not noticed"]}`);
    console.log(`  Can speak: ${aggregation.canSpeak}`);
    console.log(`  Output: "${aggregation.sentence}"`);
    console.log();
  }

  // Full aggregation with composite
  console.log("FULL AGGREGATION:");
  const fullAggregation = aggregateAll(store.getAll());
  console.log(`  Strain: ${fullAggregation.strain}`);
  console.log(`  Dose: ${fullAggregation.dose}`);
  console.log();
  
  for (const dim of fullAggregation.dimensions) {
    console.log(`  ${dim.dimension}: "${dim.sentence}"`);
  }
  console.log();
  
  if (fullAggregation.compositeSentence) {
    console.log(`  Composite: "${fullAggregation.compositeSentence}"`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 5. COMPLIANCE VERIFICATION
  // -------------------------------------------------------------------------
  console.log("5. COMPLIANCE VERIFICATION");
  console.log("-".repeat(70));
  console.log();

  const isCompliant = verifyAggregationCompliance(fullAggregation);
  console.log(`Aggregation output is compliant: ${isCompliant}`);
  console.log();

  // Test forbidden language detection
  console.log("Testing forbidden language detection:");
  const forbiddenExamples = [
    "This strain is best for focus.",
    "73% of users report clarity.",
    "Very effective for meditation.",
    "Helps with anxiety.",
  ];

  for (const example of forbiddenExamples) {
    const violations = checkCompliance(example);
    console.log(`  "${example}"`);
    console.log(`    Violations: ${violations.length > 0 ? violations.join(", ") : "none"}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 6. INSUFFICIENT DATA HANDLING
  // -------------------------------------------------------------------------
  console.log("6. INSUFFICIENT DATA HANDLING");
  console.log("-".repeat(70));
  console.log();

  // Create a new store with insufficient signals
  const sparseStore = createSignalStore();
  sparseStore.append({ dimension: "Clarity", direction: "More" });
  sparseStore.append({ dimension: "Clarity", direction: "More" });
  // Only 2 signals - below minimum threshold of 3

  const sparseAggregation = aggregateDimension(sparseStore.getAll(), "Clarity");
  console.log(`Signals: ${sparseAggregation.signalCount}`);
  console.log(`Can speak: ${sparseAggregation.canSpeak}`);
  console.log(`Output: "${sparseAggregation.sentence}"`);
  console.log();

  console.log("=".repeat(70));
  console.log("EXAMPLE COMPLETE");
  console.log("=".repeat(70));
}

// =============================================================================
// EXPORTS
// =============================================================================

// Re-export types
export type { Signal, SignalInput, Dimension, Direction };

// Re-export values
export {
  createSignal,
  createSignalOrThrow,
  validateSignalInput,
  FIXED_CONTEXT,
  FIXED_REFERENCE,
  VALID_DIMENSIONS,
  VALID_DIRECTIONS,
};

// Re-export store types and functions
export type { SignalStore };
export {
  createSignalStore,
  filterByDimension,
  countByDirection,
};

// Re-export aggregation functions
export {
  aggregateDimension,
  aggregateAll,
  checkCompliance,
  verifyAggregationCompliance,
};

// Run example if this file is executed directly
// Check if we're running in a Node environment with this as main module
const isMainModule = typeof require !== 'undefined' && require.main === module;
if (isMainModule) {
  runExample();
}

// Also export the example runner for testing
export { runExample };

