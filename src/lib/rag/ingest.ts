import { DocumentStatus } from "@/constants/statuses";
import { prisma } from "../prisma";
import { storeChunks } from "./chunks";

export async function ingestDocument(
  userId: string,
  filename: string,
  text: string,
) {
  const doc = await prisma.document.create({
    data: { userId, filename, status: DocumentStatus.processing },
  });

  try {
    const texts = text
      .split(/\n\s*\n/)
      .map((t) => t.trim())
      .filter((t) => t.length > 50);

    await storeChunks(doc.id, texts);
    await prisma.document.update({
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

  return doc;
}
