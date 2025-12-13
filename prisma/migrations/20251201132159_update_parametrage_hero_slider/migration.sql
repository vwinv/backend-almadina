-- CreateTable
CREATE TABLE "Parametrage" (
    "id" SERIAL NOT NULL,
    "siteTitle" TEXT NOT NULL,
    "siteSubtitle" TEXT,
    "logoUrl" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroBackgrounds" JSONB,
    "aboutTitle" TEXT,
    "aboutContent" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "address" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "twitterUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Parametrage_pkey" PRIMARY KEY ("id")
);
