import { bytesToFileHash } from "@/lib/extraction/shared";
import { enrichComplexPages } from "@/lib/extraction/sync";
import { pdfToDocument, type PdfDocument } from "@/lib/pdf/document";

/**
 * The boundary between "how text was obtained" and "how text is stored". Everything
 * downstream takes a DocumentSource and knows nothing else, so adding a pipeline means
 * adding a producer here and changing nothing in the chunker, the store, or the ingest.
 */

/**
 * Which path produced a segment's text. "layout" — reconstructed from text positions.
 * "model" — an LLM re-read a page whose geometry defeated that. "text" — the source had
 * no layout to reconstruct, so nothing was inferred.
 */
export type SegmentSource = "layout" | "model" | "text";

/** One structural unit of text, with everything known about where it came from. */
export interface SourceSegment {
  text: string;
  kind: "heading" | "paragraph" | "table";
  /** The section heading this sits under, or null before the first one. */
  heading: string | null;
  /** 1-based physical page. Null for sources that have no pages. */
  page: number | null;
  /** What the page prints on itself, when it disagrees with `page`. */
  pageLabel: string | null;
  source: SegmentSource;
}

export interface DocumentSource {
  filename: string;
  /** The document's own title, when it has one worth citing. */
  title: string | null;
  /** sha256 of the source bytes, or null when there were none. */
  fileHash: string | null;
  segments: SourceSegment[];
}

/** Flattens the page/paragraph tree into segments, carrying each page's numbering down. */
const documentToSegments = (doc: PdfDocument): SourceSegment[] =>
  doc.pages.flatMap((page) =>
    page.paragraphs.map((paragraph) => ({
      text: paragraph.text,
      kind: paragraph.kind,
      heading: paragraph.heading,
      page: page.page,
      pageLabel: page.label,
      source: paragraph.source,
    })),
  );

/**
 * A PDF, read geometrically and then improved where the geometry failed.
 *
 * enrichComplexPages never throws — a failure just returns the page's layout paragraphs —
 * so the fallback needs no handling here and shows up only as `source` on the segments.
 * pdfToDocument can throw, but only on a file that is not readable as a PDF at all.
 */
export async function pdfSource(
  filename: string,
  bytes: Uint8Array,
): Promise<DocumentSource> {
  const parsed = await pdfToDocument(bytes);
  const doc = await enrichComplexPages(parsed, bytes);

  return {
    filename,
    title: doc.title,
    fileHash: bytesToFileHash(bytes),
    segments: documentToSegments(doc),
  };
}

/**
 * Plain text, split on blank lines. Only empty segments are dropped — a length threshold
 * cannot tell a stray line from a section title. Nothing is inferred: no headings, no
 * pages, and source "text" rather than "layout".
 */
export function textSource(filename: string, text: string): DocumentSource {
  const segments: SourceSegment[] = text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      kind: "paragraph" as const,
      heading: null,
      page: null,
      pageLabel: null,
      source: "text" as const,
    }));

  return {
    filename,
    title: null,
    fileHash: bytesToFileHash(Buffer.from(text, "utf8")),
    segments,
  };
}
