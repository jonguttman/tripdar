import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import MycoFlow from "./MycoFlow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const partner = await prisma.partner.findFirst({
    where: { subdomain: slug, active: true },
    select: { name: true },
  });
  return {
    title: partner ? `Myco — ${partner.name}` : "Myco",
    description: "Find the experience you're looking for",
  };
}

export default async function MycoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ kiosk?: string }>;
}) {
  const { slug } = await params;
  const { kiosk } = await searchParams;

  const partner = await prisma.partner.findFirst({
    where: { subdomain: slug, active: true },
    select: { name: true, mycoWelcomeMessage: true },
  });

  if (!partner) notFound();

  return (
    <MycoFlow
      partnerSlug={slug}
      storeName={partner.name}
      welcomeMessage={partner.mycoWelcomeMessage}
      kiosk={kiosk === "1"}
    />
  );
}
