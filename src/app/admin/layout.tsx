import "./admin.css";

import { getServerSession } from "next-auth";

import { authOptions } from "@/domain/auth/config";
import {
  listAdminViewAsUsers,
  resolveAdminIdentity,
  type AdminIdentity,
  type AdminViewAsUser,
} from "@/domain/auth/viewAs";

import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  let viewAs: AdminIdentity | null = null;
  let viewAsUsers: AdminViewAsUser[] = [];

  if (session?.user?.email) {
    viewAs = await resolveAdminIdentity(session.user.email);
    if (viewAs.actualRole === "super_admin") {
      viewAsUsers = await listAdminViewAsUsers();
    }
  }

  return (
    <AdminShell viewAs={viewAs} viewAsUsers={viewAsUsers}>
      {children}
    </AdminShell>
  );
}
