import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getUserRole, type UserRole } from "@/domain/auth/role";

export const ADMIN_VIEW_AS_COOKIE = "tripdar_admin_view_as_user_id";

export interface AdminViewAsUser {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
  partnerId: string | null;
  partnerName: string | null;
}

export interface AdminIdentity {
  actualEmail: string;
  actualRole: UserRole;
  effectiveEmail: string;
  effectiveRole: UserRole;
  effectiveUserId: string | null;
  effectiveName: string | null;
  effectivePartnerId: string | null;
  effectivePartnerName: string | null;
  isViewAsActive: boolean;
}

function userLabel(user: Pick<AdminViewAsUser, "name" | "email">): string {
  return user.name ? `${user.name} <${user.email}>` : user.email;
}

async function readViewAsUserId(request?: NextRequest): Promise<string | null> {
  if (request) return request.cookies.get(ADMIN_VIEW_AS_COOKIE)?.value ?? null;

  const cookieStore = await cookies();
  return cookieStore.get(ADMIN_VIEW_AS_COOKIE)?.value ?? null;
}

export async function listAdminViewAsUsers(): Promise<AdminViewAsUser[]> {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    orderBy: [{ email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      partnerId: true,
      partner: { select: { name: true } },
    },
  });

  return Promise.all(
    users
      .filter((user): user is typeof user & { email: string } => Boolean(user.email))
      .map(async (user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: await getUserRole(user.email),
        partnerId: user.partnerId,
        partnerName: user.partner?.name ?? null,
      }))
  );
}

export async function resolveAdminIdentity(
  sessionEmail: string,
  request?: NextRequest
): Promise<AdminIdentity> {
  const actualEmail = sessionEmail.toLowerCase();
  const actualRole = await getUserRole(actualEmail);
  const fallback: AdminIdentity = {
    actualEmail,
    actualRole,
    effectiveEmail: actualEmail,
    effectiveRole: actualRole,
    effectiveUserId: null,
    effectiveName: null,
    effectivePartnerId: null,
    effectivePartnerName: null,
    isViewAsActive: false,
  };

  const viewAsUserId = await readViewAsUserId(request);
  if (!viewAsUserId || actualRole !== "super_admin") return fallback;

  const target = await prisma.user.findUnique({
    where: { id: viewAsUserId },
    select: {
      id: true,
      name: true,
      email: true,
      partnerId: true,
      partner: { select: { name: true } },
    },
  });

  if (!target?.email) return fallback;

  const effectiveRole = await getUserRole(target.email);
  return {
    actualEmail,
    actualRole,
    effectiveEmail: target.email.toLowerCase(),
    effectiveRole,
    effectiveUserId: target.id,
    effectiveName: target.name,
    effectivePartnerId: target.partnerId,
    effectivePartnerName: target.partner?.name ?? null,
    isViewAsActive: true,
  };
}

export async function getAdminViewAsTarget(
  userId: string
): Promise<AdminViewAsUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      partnerId: true,
      partner: { select: { name: true } },
    },
  });

  if (!user?.email) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: await getUserRole(user.email),
    partnerId: user.partnerId,
    partnerName: user.partner?.name ?? null,
  };
}

export function viewAsWriteRefusal(identity: AdminIdentity): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "VIEW_AS_READ_ONLY",
        message: `View-as mode is read-only. Exit View as ${userLabel({
          name: identity.effectiveName,
          email: identity.effectiveEmail,
        })} before making admin changes.`,
      },
    },
    { status: 403 }
  );
}

