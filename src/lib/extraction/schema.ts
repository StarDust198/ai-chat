import { createHash } from "node:crypto";
import { z } from "zod";
import type { PdfParagraph } from "@/lib/pdf/document";

/**
 * The contract with the model: what it is asked for, and what it is allowed to return.
 *
 * Defined once. The same Zod schema becomes the JSON Schema sent with the request and
 * the parser applied to the response, so the two cannot drift apart.
 *
 * Blocks are the wire and storage format; PdfParagraph is the runtime type. They are
 * kept separate because what is stored is the model's raw answer — an audit record —
 * while a paragraph carries fields the model never sees, such as its threaded heading.
 */

/**
 * A single unit of text on the page.
 *
 * The type values match PdfParagraph["kind"] today, which is convenient but not
 * load-bearing: blocksToParagraphs maps between them explicitly, so the day the wire
 * format grows a type the runtime has no kind for, that map fails to compile.
 */
const blockSchema = z.object({
  type: z.enum(["heading", "paragraph", "table"]),
  text: z.string(),
});

export const blocksSchema = z.array(blockSchema);

const pageSchema = z.object({
  /**
   * Plain number rather than z.number().int(): the integer variant emits minimum and
   * maximum bounds into the JSON Schema, and structured outputs rejects numerical
   * constraints. Nothing is lost — a page number is only ever trusted after it has been
   * checked against the exact set of pages that were requested.
   */
  page: z.number(),
  blocks: blocksSchema,
});

export const extractionSchema = z.object({ pages: z.array(pageSchema) });

export type ExtractionBlock = z.infer<typeof blockSchema>;
export type ExtractionPage = z.infer<typeof pageSchema>;

/**
 * The schema as the API wants it.
 *
 * $schema is stripped: Zod emits the dialect declaration, the API expects a bare schema
 * object, and an unrecognised top-level key is not worth discovering as a 400 on the
 * first real batch. Note that z.object already emits additionalProperties: false, which
 * structured outputs requires — z.strictObject would be redundant here.
 */
const jsonSchema: Record<string, unknown> = z.toJSONSchema(extractionSchema);
delete jsonSchema.$schema;

export const extractionJsonSchema = jsonSchema;

/**
 * What the model is told to do.
 *
 * Says nothing about columns. The detector's "vertical-split" reason covers a
 * two-column page and a table indistinguishably — the measurement cannot separate them
 * — so an instruction to read one column and then the other would silently destroy
 * every table it was applied to.
 */
const PROMPT_TEMPLATE = `Transcribe the text of {pages} of the attached PDF.

Read each page the way a person would: follow whatever structure is actually on it,
whether that is one column, several columns, a table, or a mixture of them.

- Return one block per paragraph, in reading order.
- A heading is type "heading". Ordinary prose is type "paragraph".
- A table is a SINGLE block of type "table" containing the whole table as Markdown,
  header row included. Never one block per row: a table split across blocks is useless
  to a reader who retrieves only one of the pieces.
- Transcribe what is printed. Do not summarise, paraphrase, translate, reorder, correct
  spelling, or add anything that is not on the page.
- Omit running headers, running footers, and page numbers.
- If a page carries no readable text, return it with an empty blocks array.
- Label each page with the page number it was asked for.`;

/**
 * Identifies the instructions a cached row was produced under.
 *
 * Hashed rather than hand-versioned: a promptVersion string that has to be remembered
 * and bumped is a stale-cache bug waiting to happen, whereas a hash of the text cannot
 * be forgotten. Hashed before interpolation, so asking for pages 3 and 7 and asking for
 * page 5 are the same prompt — otherwise every combination of pages would be its own
 * cache key and the cache would almost never hit.
 */
export const PROMPT_HASH = createHash("sha256")
  .update(PROMPT_TEMPLATE)
  .digest("hex")
  .slice(0, 32);

/** "page 3", "pages 3 and 7", "pages 3, 7 and 11" — as a person would write it. */
const pagesToPhrase = (pages: number[]) => {
  if (pages.length === 1) return `page ${pages[0]}`;

  const last = pages[pages.length - 1];
  return `pages ${pages.slice(0, -1).join(", ")} and ${last}`;
};

export const pagesToPrompt = (pages: number[]) =>
  PROMPT_TEMPLATE.replace("{pages}", pagesToPhrase(pages));

/**
 * Turns a model's answer for one page into paragraphs the rest of the pipeline can use.
 *
 * heading is left null because threading runs over the whole document after every page
 * has been merged. bbox is null because coordinates are never requested: a model
 * inventing plausible ones would be worse than having none. source is set here, so a
 * model cannot claim its output came from the layout.
 */
export const blocksToParagraphs = (blocks: ExtractionBlock[]): PdfParagraph[] =>
  blocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text.length > 0)
    .map((block) => ({
      text: block.text,
      kind: block.type,
      heading: null,
      bbox: null,
      source: "model" as const,
    }));
