import { bytesToFileHash } from "@/lib/extraction/shared";
import { enrichComplexPages } from "@/lib/extraction/sync";
import { pdfToDocument, type PdfDocument } from "@/lib/pdf/document";

/**
 * The boundary between "how text was obtained" and "how text is stored".
 *
 * Everything upstream of here is a pipeline — a PDF read geometrically and patched by a
 * model, a Markdown file, whatever comes next. Everything downstream takes a
 * DocumentSource and knows nothing else, so adding a pipeline means adding a producer in
 * this file and changing nothing in the chunker, the store, or the ingest.
 *
 * Segments are structural units, not chunks. A pipeline says what the units are and where
 * each came from; the chunker decides how they are grouped for retrieval. Keeping those
 * separate is what lets the chunker's rules be stated once instead of once per format.
 */

/**
 * Which path produced a segment's text.
 *
 * "layout" — reconstructed from text positions on the page. "model" — an LLM re-read a
 * page whose geometry defeated that reconstruction. "text" — the source had no layout to
 * reconstruct, so nothing was inferred.
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
 * enrichComplexPages never throws: no API key, no database, network, quota, a malformed
 * response, a failed faithfulness check — every one of them returns the document with its
 * layout paragraphs intact, page by page rather than document by document. So the
 * fallback needs no handling here, and is invisible in the result. What makes it visible
 * afterwards is `source` on the segments this produces, which is why it is carried.
 *
 * pdfToDocument is the only call here that can throw, and only on a file that is not
 * readable as a PDF at all — a document-level failure, which is what the caller's status
 * is for.
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
 * Plain text, split on blank lines.
 *
 * Only empty segments are dropped. The previous ingest also dropped anything under 50
 * characters, which silently deleted every heading and every short paragraph in the
 * corpus — a length threshold cannot tell a stray line from a section title, and the
 * chunker's merge rules are the right place to deal with fragments.
 *
 * Nothing is inferred: no headings, no pages, and source "text" rather than "layout",
 * because no layout was reconstructed.
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
