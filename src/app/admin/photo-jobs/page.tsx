import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/domain/auth/config";
import { getUserRole } from "@/domain/auth/role";
import { Alert } from "@/components/admin";
import PhotoJobReviewClient from "./PhotoJobReviewClient";

export default async function PhotoJobsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/admin");

  if ((await getUserRole(email)) !== "super_admin") {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-8">
        <Alert tone="error">This review queue is restricted to super administrators.</Alert>
      </div>
    );
  }

  return <PhotoJobReviewClient />;
}
