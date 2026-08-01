import { cookies } from "next/headers";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getUserRole, type UserRole } from "@/domain/auth/role";
import { readViewAsCookie, VIEW_AS_COOKIE, type ActiveViewAs } from "@/domain/auth/viewAs";
import { prisma } from "@/lib/prisma";

export type AdminSession = Session & {
  actualUser: {
    email: string;
    role: UserRole;
  };
  viewAs: ActiveViewAs | null;
};

/**
 * Resolve the identity used by admin API routes.
 *
 * The cookie is only a signed target pointer. It is never sufficient authority:
 * every call re-authenticates the real database session, resolves the real user's
 * role, and only then loads a still-partner-admin target from the database.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const session = await getServerSession(authOptions);
  const actualEmail = session?.user?.email;
  if (!session || !actualEmail) return null;

  const actualRole = await getUserRole(actualEmail);
  const baseSession: AdminSession = {
    ...session,
    actualUser: { email: actualEmail, role: actualRole },
    viewAs: null,
  };

  if (actualRole !== "super_admin") return baseSession;

  const cookieStore = await cookies();
  const targetId = await readViewAsCookie(
    cookieStore.get(VIEW_AS_COOKIE)?.value,
    process.env.NEXTAUTH_SECRET
  );
  if (!targetId) return baseSession;

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      partner: { select: { name: true } },
    },
  });
  if (!target?.email || (await getUserRole(target.email)) !== "partner_admin") {
    return baseSession;
  }

  const viewAs: ActiveViewAs = {
    id: target.id,
    email: target.email,
    name: target.name,
    role: "partner_admin",
    partnerName: target.partner?.name ?? null,
  };

  return {
    ...baseSession,
    user: {
      ...session.user,
      email: target.email,
      name: target.name,
      image: target.image,
    },
    viewAs,
  };
}
