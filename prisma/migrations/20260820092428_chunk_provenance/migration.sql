-- AlterTable
ALTER TABLE "Chunk" ADD COLUMN     "heading" TEXT,
ADD COLUMN     "kind" TEXT,
ADD COLUMN     "page" INTEGER,
ADD COLUMN     "pageLabel" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "tokenCount" INTEGER,
ALTER COLUMN "model" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fileHash" TEXT,
ADD COLUMN     "title" TEXT;
