-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "strainId" TEXT NOT NULL,
    "doseCategory" TEXT NOT NULL,
    "scale" TEXT NOT NULL,
    "dimensionId" TEXT NOT NULL,
    "referenceFrame" TEXT NOT NULL,
    "comparisonDose" TEXT,
    "comparisonStrainId" TEXT,
    "direction" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL
);
