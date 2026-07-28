import StaffReviewClient from "./staff-review-client";

export default async function StaffCatalogReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <StaffReviewClient token={token} />;
}
