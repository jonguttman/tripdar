/**
 * Meaning Layer v1.0 — Application Guards
 *
 * Domain service that is the ONLY valid creation path for Signals.
 * - Validates strictly (allow-list + conditional rules)
 * - Persists via Prisma (writes only)
 * - Freezes returned Signal record (immutability)
 *
 * Explicitly forbidden operations exist only to prevent accidental usage.
 */

import { SignalImmutabilityError } from "./errors";
import type { PrismaClientLike, SignalRecord } from "./types";
import { validateCreateSignalInput } from "./validate";

/**
 * createSignal(input) — the ONLY valid creation path.
 *
 * - Accepts a raw input object (unknown)
 * - Validates against Meaning Layer v1.0 Signal Table Definition
 * - Persists via Prisma
 * - Returns an immutable (Object.freeze) SignalRecord
 */
export async function createSignal(
  prisma: PrismaClientLike,
  input: unknown
): Promise<SignalRecord> {
  const record = validateCreateSignalInput(input);

  // Persist via Prisma (no other persistence behavior allowed here)
  const created = await prisma.signal.create({ data: record });

  // Freeze returned record so consumers cannot mutate it in-memory.
  return Object.freeze(created);
}

/**
 * updateSignal() is explicitly forbidden by Meaning Layer v1.0.
 * Exists only to prevent accidental usage.
 */
export function updateSignal(): never {
  throw new SignalImmutabilityError(
    "updateSignal is forbidden: Signals are append-only and must never be updated (Meaning Layer v1.0)."
  );
}

/**
 * deleteSignal() is explicitly forbidden by Meaning Layer v1.0.
 * Exists only to prevent accidental usage.
 */
export function deleteSignal(): never {
  throw new SignalImmutabilityError(
    "deleteSignal is forbidden: Signals are append-only and must never be deleted (Meaning Layer v1.0)."
  );
}
