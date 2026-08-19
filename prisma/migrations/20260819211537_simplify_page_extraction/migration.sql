/*
  Warnings:

  - The primary key for the `PageExtraction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `attempts` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `batchId` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `error` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `expiresAt` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `id` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `layoutText` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `PageExtraction` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `PageExtraction` table. All the data in the column will be lost.
  - Made the column `blocks` on table `PageExtraction` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "PageExtraction_batchId_idx";

-- DropIndex
DROP INDEX "PageExtraction_fileHash_page_model_prompt_key";

-- DropIndex
DROP INDEX "PageExtraction_status_idx";

-- AlterTable
ALTER TABLE "PageExtraction" DROP CONSTRAINT "PageExtraction_pkey",
DROP COLUMN "attempts",
DROP COLUMN "batchId",
DROP COLUMN "error",
DROP COLUMN "expiresAt",
DROP COLUMN "id",
DROP COLUMN "layoutText",
DROP COLUMN "status",
DROP COLUMN "updatedAt",
ALTER COLUMN "blocks" SET NOT NULL,
ADD CONSTRAINT "PageExtraction_pkey" PRIMARY KEY ("fileHash", "page", "model", "prompt");
