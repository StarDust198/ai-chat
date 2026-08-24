import { createHash } from "node:crypto";
import { z } from "zod";
import type { PdfParagraph } from "@/lib/pdf/document";

/**
 * The contract with the model. One Zod schema becomes both the JSON Schema sent with the
 * request and the parser applied to the response, so the two cannot drift apart.
 *
 * Blocks are the wire and storage format; PdfParagraph is the runtime type, carrying
 * fields the model never sees such as its threaded heading.
 */

const blockSchema = z.object({
  type: z.enum(["heading", "paragraph", "table"]),
  text: z.string(),
});

export const blocksSchema = z.array(blockSchema);

const pageSchema = z.object({
  /**
   * Plain number rather than z.number().int(): the integer variant emits bounds into the
   * JSON Schema, which structured outputs rejects. Nothing is lost — a page number is only
   * trusted after it is checked against the exact set requested.
   */
  page: z.number(),
  blocks: blocksSchema,
});

export const extractionSchema = z.object({ pages: z.array(pageSchema) });

export type ExtractionBlock = z.infer<typeof blockSchema>;
export type ExtractionPage = z.infer<typeof pageSchema>;

/**
 * The schema as the API wants it: $schema stripped, since Zod emits the dialect
 * declaration and the API expects a bare object. z.object already emits
 * additionalProperties: false, which structured outputs requires.
 */
const jsonSchema: Record<string, unknown> = z.toJSONSchema(extractionSchema);
delete jsonSchema.$schema;

export const extractionJsonSchema = jsonSchema;

/**
 * What the model is told to do.
 *
 * Says nothing about columns on purpose: "vertical-split" covers a two-column page and a
 * table indistinguishably, so an instruction to read one column then the other would
 * destroy every table it was applied to.
 *
 * The table and definition rules both override the instinct to return one block per visual
 * paragraph: a reader retrieves one block, so a block has to answer something on its own. A
 * term is asked for as "heading" rather than a new type because the pipeline already
 * threads a heading into Chunk.heading, the embedded text and the citation — hence also
 * dropping its trailing punctuation. The last clause bounds the risk: a heading threads
 * forward, so a "Note." promoted by mistake becomes the context for everything after it.
 */
const PROMPT_TEMPLATE = `Transcribe the text of {pages} of the attached PDF.

Read each page the way a person would: follow whatever structure is actually on it,
whether that is one column, several columns, a table, or a mixture of them.

- Return one block per paragraph, in reading order.
- A heading is type "heading". Ordinary prose is type "paragraph".
- A term set off from its own definition — a short bolded phrase followed by the text
  that defines it, as in a glossary — is TWO blocks: the term as type "heading", then
  its definition as type "paragraph". Give the term without the punctuation that
  separates it from its definition, and do not repeat the term inside the definition.
  This is only for a genuine term-and-definition pair, never for a sentence that merely
  opens with emphasis.
- A table is a SINGLE block of type "table" containing the whole table as Markdown,
  header row included. Never one block per row: a table split across blocks is useless
  to a reader who retrieves only one of the pieces.
- Transcribe what is printed. Do not summarise, paraphrase, translate, reorder, correct
  spelling, or add anything that is not on the page.
- Omit running headers, running footers, and page numbers.
- If a page carries no readable text, return it with an empty blocks array.
- Label each page with the page number it was asked for.`;

/**
 * Identifies the instructions a cached row was produced under, so editing the prompt
 * re-reads instead of serving stale rows. Hashed before interpolation, or every
 * combination of page numbers would be its own cache key.
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
 * heading is null because threading runs over the whole document afterwards; bbox because
 * invented coordinates would be worse than none; source is set here, so a model cannot
 * claim its output came from the layout.
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
