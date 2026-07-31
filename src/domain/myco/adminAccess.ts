/**
 * Partner-ownership resolution for product-scoped admin routes.
 *
 * Closes the isolation gap where /api/admin/myco/[id]* routes operated on any
 * product ID after a bare session check. Rule (per BUG-2026-06-09-001):
 * auth/role first, ownership second, user-supplied ids last — partner admins
 * may only touch products under their assigned partner; super admins may
 * touch any.
 */

import { prisma } from "@/lib/prisma";
import { resolveAdminIdentity } from "@/domain/auth/viewAs";
import type { NextRequest } from "next/server";

export type ProductAccessResult =
  | { ok: true; productId: string; partnerId: string }
  | { ok: false; status: 403 | 404; message: string };

export async function resolveProductForAdmin(
  email: string,
  productId: string,
  request?: NextRequest
): Promise<ProductAccessResult> {
  const product = await prisma.storeProductCatalog.findUnique({
    where: { id: productId },
    select: { id: true, partnerId: true },
  });

  if (!product) {
    return { ok: false, status: 404, message: "Product not found" };
  }

  const identity = await resolveAdminIdentity(email, request);
  const role = identity.effectiveRole;
  if (role === "super_admin") {
    return { ok: true, productId: product.id, partnerId: product.partnerId };
  }

  const user = await prisma.user.findUnique({
    where: { email: identity.effectiveEmail },
    select: { partnerId: true },
  });
  if (!user?.partnerId || user.partnerId !== product.partnerId) {
    // 404, not 403: don't confirm to another partner that this product exists
    return { ok: false, status: 404, message: "Product not found" };
  }

  return { ok: true, productId: product.id, partnerId: product.partnerId };
}
