/*
  Warnings:

  - You are about to drop the `PageExtractionCache` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "PageExtractionCache";

-- CreateTable
CREATE TABLE "PageExtraction" (
    "id" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reasons" TEXT[],
    "batchId" TEXT,
    "layoutText" TEXT,
    "blocks" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PageExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageExtraction_status_idx" ON "PageExtraction"("status");

-- CreateIndex
CREATE INDEX "PageExtraction_batchId_idx" ON "PageExtraction"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PageExtraction_fileHash_page_model_prompt_key" ON "PageExtraction"("fileHash", "page", "model", "prompt");
