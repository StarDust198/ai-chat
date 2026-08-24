import { DocumentStatus } from "@/constants/statuses";
import { prisma } from "../prisma";
import { segmentsToChunks } from "./chunker";
import { storeChunks } from "./chunks";
import type { DocumentSource } from "./sources";

/**
 * Stores a document and the chunks retrieval will match against. Takes a DocumentSource
 * and knows nothing else — callers pick the pipeline:
 *
 *   ingestDocument(userId, await pdfSource(name, bytes))
 *   ingestDocument(userId, textSource(name, text))
 */
export async function ingestDocument(userId: string, source: DocumentSource) {
  // Re-ingesting a file replaces what it produced last time, chunks included via the
  // cascade. Replacing rather than skipping costs nothing here: by this point the source
  // has already been parsed and, for a PDF, re-read by a model. Skipping that expense
  // would have to happen in the caller, ahead of pdfSource.
  if (source.fileHash)
    await prisma.document.deleteMany({
      where: { userId, fileHash: source.fileHash },
    });

  const doc = await prisma.document.create({
    data: {
      userId,
      filename: source.filename,
      title: source.title,
      fileHash: source.fileHash,
      status: DocumentStatus.processing,
    },
  });

  try {
    await storeChunks(doc.id, segmentsToChunks(source.segments), source.title);

    return await prisma.document.update({
      where: { id: doc.id },
      data: { status: DocumentStatus.success },
    });
  } catch (err) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: DocumentStatus.error },
    });

    throw err;
  }
}
