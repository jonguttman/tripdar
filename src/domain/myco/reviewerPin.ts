/**
 * KEWL-2335 — reviewer PIN.
 *
 * A 4-digit PIN is 10,000 combinations. This is deterrence — it keeps the wrong
 * co-worker from filing reviews under someone else's name on a shared link. It is not
 * security-grade and is not represented as such anywhere in the UI. What makes it
 * workable is that the keyspace cannot be walked: scrypt makes each guess expensive and
 * a per-reviewer lockout stops automated attempts well before 10,000.
 */

import crypto from "crypto";

/** scrypt cost. N=16384 keeps a single verify in the tens of milliseconds. */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

export const MAX_PIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

export function isValidPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{4}$/.test(pin);
}

/**
 * Rejects the handful of PINs that would make the small keyspace even smaller.
 * Kept short on purpose — a long blocklist just frustrates staff.
 */
export function isTooObviousPin(pin: string): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true; // 0000, 1111, ...
  if (pin === "1234" || pin === "4321" || pin === "1230" || pin === "2580") return true;
  return false;
}

function scrypt(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      pin,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
      (error, derived) => (error ? reject(error) : resolve(derived))
    );
  });
}

/** Encoded as `scrypt$N$r$p$salt$hash` so the cost can be raised without a migration. */
export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) throw new Error("PIN must be exactly 4 digits");
  const salt = crypto.randomBytes(SALT_BYTES);
  const derived = await scrypt(pin, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

export async function verifyPin(pin: string, stored: string | null): Promise<boolean> {
  if (!stored || !isValidPinFormat(pin)) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      pin,
      salt,
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p) },
      (error, out) => (error ? reject(error) : resolve(out))
    );
  });
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export interface PinLockoutState {
  pinFailedAttempts: number;
  pinLockedUntil: Date | null;
}

export function isLockedOut(state: PinLockoutState, now = new Date()): boolean {
  return Boolean(state.pinLockedUntil && state.pinLockedUntil.getTime() > now.getTime());
}

export function lockoutSecondsRemaining(state: PinLockoutState, now = new Date()): number {
  if (!isLockedOut(state, now)) return 0;
  return Math.ceil((state.pinLockedUntil!.getTime() - now.getTime()) / 1000);
}

/** Patch to apply after a failed attempt. Locks the reviewer out at MAX_PIN_ATTEMPTS. */
export function failedAttemptPatch(state: PinLockoutState, now = new Date()) {
  const attempts = state.pinFailedAttempts + 1;
  if (attempts >= MAX_PIN_ATTEMPTS) {
    return { pinFailedAttempts: 0, pinLockedUntil: new Date(now.getTime() + LOCKOUT_MS) };
  }
  return { pinFailedAttempts: attempts, pinLockedUntil: null };
}

export function successfulAttemptPatch(now = new Date()) {
  return { pinFailedAttempts: 0, pinLockedUntil: null, pinLastUsedAt: now };
}

/**
 * Reviewer session cookie value. HMAC'd against the server secret and bound to the
 * access token, so a session minted on one staff link cannot be replayed on another.
 */
export function signReviewerSession(input: {
  employeeId: string;
  tokenId: string;
  issuedAt: number;
  secret: string;
}): string {
  const payload = `${input.employeeId}.${input.tokenId}.${input.issuedAt}`;
  const mac = crypto.createHmac("sha256", input.secret).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export const REVIEWER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // remembered per device

/**
 * `issuedAt` comes back on success so callers can compare it against a reviewer's
 * revocation epoch (KEWL-2394) — a stateless cookie cannot be deleted server-side, so
 * "this session predates the reset" is the only way an admin PIN reset can sign a device
 * out rather than merely change the next prompt.
 */
export function verifyReviewerSession(
  value: string | null | undefined,
  input: { tokenId: string; secret: string; now?: number }
): { ok: true; employeeId: string; issuedAt: number } | { ok: false } {
  if (!value) return { ok: false };
  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false };
  const [employeeId, tokenId, issuedAtRaw, mac] = parts;
  if (tokenId !== input.tokenId) return { ok: false };
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isFinite(issuedAt)) return { ok: false };
  const now = input.now ?? Date.now();
  if (now - issuedAt > REVIEWER_SESSION_TTL_MS) return { ok: false };

  const expected = crypto
    .createHmac("sha256", input.secret)
    .update(`${employeeId}.${tokenId}.${issuedAtRaw}`)
    .digest("base64url");
  const macBuffer = Buffer.from(mac);
  const expectedBuffer = Buffer.from(expected);
  if (macBuffer.length !== expectedBuffer.length) return { ok: false };
  if (!crypto.timingSafeEqual(macBuffer, expectedBuffer)) return { ok: false };
  return { ok: true, employeeId, issuedAt };
}
