/*
  Warnings:

  - The primary key for the `PageExtraction` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `prompt` on the `PageExtraction` table. All the data in the column will be lost.
  - Added the required column `promptHash` to the `PageExtraction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
-- ALTER TABLE "PageExtraction" DROP CONSTRAINT "PageExtraction_pkey",
-- DROP COLUMN "prompt",
-- ADD COLUMN     "promptHash" TEXT NOT NULL,
-- ADD CONSTRAINT "PageExtraction_pkey" PRIMARY KEY ("fileHash", "page", "model", "promptHash");

-- Replaced with
ALTER TABLE "PageExtraction" RENAME COLUMN "prompt" TO "promptHash";