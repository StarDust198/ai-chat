import { DocumentStatus } from "@/constants/statuses";
import { prisma } from "../prisma";
import { segmentsToChunks } from "./chunker";
import { storeChunks } from "./chunks";
import type { DocumentSource } from "./sources";

/**
 * Stores a document and the chunks retrieval will match against.
 *
 * Knows nothing about PDFs, or about text, or about how either was obtained — it takes a
 * DocumentSource and that is the whole contract. Callers pick the pipeline:
 *
 *   ingestDocument(userId, await pdfSource(name, bytes))
 *   ingestDocument(userId, textSource(name, text))
 *
 * A pipeline that fails partway is not this function's problem to detect: pdfSource
 * degrades page by page and reports what happened through each segment's `source`, so what
 * arrives here is always a complete document, occasionally a less good one.
 */
export async function ingestDocument(userId: string, source: DocumentSource) {
  // Re-ingesting a file replaces what it produced last time, chunks included via the
  // cascade. Replace rather than skip: by the time this is called the source has already
  // been parsed and, for a PDF, re-read by a model, so returning the existing row early
  // would save nothing that was expensive. A true skip belongs in the caller, ahead of
  // pdfSource — which is also the only place it could avoid the cost.
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
