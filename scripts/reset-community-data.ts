import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetCommunityData() {
  console.log("Resetting all community analytics data...\n");

  const tables = [
    { name: "AnalyticsSummary", model: prisma.analyticsSummary },
    { name: "AnalyticsEvent", model: prisma.analyticsEvent },
    { name: "StrainCorrelation", model: prisma.strainCorrelation },
    { name: "UserStrainProfile", model: prisma.userStrainProfile },
    { name: "SettingInsight", model: prisma.settingInsight },
    { name: "DoseCurveData", model: prisma.doseCurveData },
    { name: "StrainConfidence", model: prisma.strainConfidence },
    { name: "TripReport", model: prisma.tripReport },
    { name: "StrainReview", model: prisma.strainReview },
    { name: "StrainRating", model: prisma.strainRating },
  ] as const;

  for (const { name, model } of tables) {
    const result = await (model as any).deleteMany();
    console.log(`  ${name}: ${result.count} rows deleted`);
  }

  console.log("\nDone. All community data has been reset.");
}

resetCommunityData()
  .catch((e) => {
    console.error("Error resetting data:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
