/*
  Warnings:

  - A unique constraint covering the columns `[userId,fileHash]` on the table `Document` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Document_userId_fileHash_key" ON "Document"("userId", "fileHash");
