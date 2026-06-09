/*
  Warnings:

  - Made the column `createdBy` on table `Note` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Note" ALTER COLUMN "createdBy" SET NOT NULL;
