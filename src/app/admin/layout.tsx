import "./admin.css";

import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getAdminSession } from "@/domain/auth/adminSession";
import { getUserRole } from "@/domain/auth/role";
import type { ViewAsUserOption } from "@/domain/auth/viewAs";
import { prisma } from "@/lib/prisma";
import AdminShell from "./AdminShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const actualSession = await getServerSession(authOptions);
  const actualEmail = actualSession?.user?.email;
  const isSuperAdmin = actualEmail
    ? (await getUserRole(actualEmail)) === "super_admin"
    : false;

  let viewAsUsers: ViewAsUserOption[] = [];
  let activeViewAs = null;

  if (isSuperAdmin) {
    const [users, effectiveSession] = await Promise.all([
      prisma.user.findMany({
        where: { email: { not: null } },
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          partner: { select: { name: true } },
        },
      }),
      getAdminSession(),
    ]);

    const resolved = await Promise.all(
      users.map(async (user) => ({
        user,
        role: await getUserRole(user.email!),
      }))
    );
    viewAsUsers = resolved
      .filter(({ role }) => role === "partner_admin")
      .map(({ user }) => ({
        id: user.id,
        email: user.email!,
        role: "partner_admin" as const,
        partnerName: user.partner?.name ?? null,
      }));
    activeViewAs = effectiveSession?.viewAs ?? null;
  }

  return (
    <AdminShell
      isSuperAdmin={isSuperAdmin}
      viewAsUsers={viewAsUsers}
      activeViewAs={activeViewAs}
    >
      {children}
    </AdminShell>
  );
}
