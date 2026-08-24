-- CreateTable
CREATE TABLE "PageExtractionCache" (
    "fileHash" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageExtractionCache_pkey" PRIMARY KEY ("fileHash","page","model","prompt")
);
