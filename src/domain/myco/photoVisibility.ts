/**
 * Photo visibility — the single rule for which `ProductPhoto` rows count as live assets.
 *
 * Brand-submitted photos (the KEWL-2331 brand portal) land as `pending` and are only
 * promoted to `approved` by the staff review queue. That contract holds only if every
 * reader enforces it, so:
 *
 *  - anything that shows a photo to a customer (recommendation candidates, tester
 *    pages) must read through `APPROVED_PHOTO_WHERE` / `approvedPhotoUrl`, and
 *  - anything that counts photos toward listing/activation readiness must use
 *    `approvedPhotoCount` — a pending photo must never satisfy the photo gate.
 *
 * Admin and staff review surfaces deliberately render pending rows; they render them
 * labelled (`photoStatusLabel`) rather than filtering them out, so a reviewer can act
 * on them without mistaking one for a published asset.
 *
 * Note: `ProductPhoto.status` defaults to `"approved"`, so pre-brand-portal rows and
 * admin uploads keep their existing behaviour.
 */

export const APPROVED_PHOTO_STATUS = "approved";
export const PENDING_PHOTO_STATUS = "pending";
export const REJECTED_PHOTO_STATUS = "rejected";

/** Prisma `where` selecting only photos cleared for customer display and readiness. */
export const APPROVED_PHOTO_WHERE = { status: APPROVED_PHOTO_STATUS } as const;

type PhotoStatusRow = { status: string };

export function isApprovedPhoto(photo: PhotoStatusRow): boolean {
  return photo.status === APPROVED_PHOTO_STATUS;
}

/**
 * Counts only photos that may satisfy the readiness/activation photo requirement.
 * Pending and rejected rows are excluded on purpose — see the module docs.
 */
export function approvedPhotoCount(photos: readonly PhotoStatusRow[]): number {
  let count = 0;
  for (const photo of photos) if (isApprovedPhoto(photo)) count += 1;
  return count;
}

/**
 * First approved photo URL in the caller's query order, or null when none is approved.
 * Callers keep their own fallback to the legacy `photoUrl` scalar column.
 */
export function approvedPhotoUrl(photos: readonly (PhotoStatusRow & { url: string })[]): string | null {
  return photos.find(isApprovedPhoto)?.url ?? null;
}

/** Human label for review surfaces that intentionally show non-approved photos. */
export function photoStatusLabel(status: string): string | null {
  if (status === PENDING_PHOTO_STATUS) return "Pending review";
  if (status === REJECTED_PHOTO_STATUS) return "Rejected";
  return null;
}
