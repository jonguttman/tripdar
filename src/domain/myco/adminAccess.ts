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
import { getUserRole } from "@/domain/auth/role";

export type ProductAccessResult =
  | { ok: true; productId: string; partnerId: string }
  | { ok: false; status: 403 | 404; message: string };

export async function resolveProductForAdmin(
  email: string,
  productId: string
): Promise<ProductAccessResult> {
  const product = await prisma.storeProductCatalog.findUnique({
    where: { id: productId },
    select: { id: true, partnerId: true },
  });

  if (!product) {
    return { ok: false, status: 404, message: "Product not found" };
  }

  const role = await getUserRole(email);
  if (role === "super_admin") {
    return { ok: true, productId: product.id, partnerId: product.partnerId };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { partnerId: true },
  });
  if (!user?.partnerId || user.partnerId !== product.partnerId) {
    // 404, not 403: don't confirm to another partner that this product exists
    return { ok: false, status: 404, message: "Product not found" };
  }

  return { ok: true, productId: product.id, partnerId: product.partnerId };
}

export type PartnerMutationAccessResult =
  | { ok: true; partnerId: string }
  | { ok: false; status: 404; message: string };

export async function resolvePartnerMutationForAdmin(
  email: string,
  partnerId: string
): Promise<PartnerMutationAccessResult> {
  const role = await getUserRole(email);
  if (role === "super_admin") {
    const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { id: true } });
    return partner ? { ok: true, partnerId: partner.id } : { ok: false, status: 404, message: "Partner not found" };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { partnerId: true },
  });
  if (role !== "partner_admin" || user?.partnerId !== partnerId) {
    return { ok: false, status: 404, message: "Partner not found" };
  }
  return { ok: true, partnerId };
}
