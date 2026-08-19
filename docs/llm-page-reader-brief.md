# Brief: LLM reader for complex PDF pages

## Task

Build the stage that re-reads PDF pages the geometric extractor cannot handle, using
Claude, and merges the result back into the document. The detector that identifies
those pages is already built and calibrated. **You are building the reader, not the
detector.**

Read `src/lib/pdf/document.ts`, `layout.ts`, `lines.ts`, `extract.ts`, and
`boilerplate.ts` before starting. They are short, heavily commented, and the comments
explain decisions you would otherwise re-derive.

## Where this fits

```
pdfToDocument(bytes)                     ← pure, deterministic, already built
  extract → itemsToLines → stripBoilerplate → assessLayout → linesToParagraphs
  ↓
PdfDocument { title, pages[] }           ← every page carries layout-derived paragraphs
  ↓
enrichComplexPages(doc, bytes)           ← YOU BUILD THIS
  replaces paragraphs on pages where layout.kind === "complex"
  ↓
PdfDocument                              ← same type, same shape
```

`pdfToDocument` **flags but never routes**. It stays a pure function of bytes with no
network, no API key, and no cost. That separation is deliberate and must be preserved:

- It makes batching across documents possible. If each `pdfToDocument` awaited its own
  model call, the Batches API (50% cheaper) could never be used.
- Layout paragraphs on complex pages are the **fallback**. If the model is down, out of
  quota, or switched off, ingestion still produces today's output.

## What already exists

### Types (`src/lib/pdf/document.ts`)

```ts
interface PdfDocument { title: string | null; pages: PdfPage[] }

interface PdfPage {
  page: number;              // 1-based physical index
  label: string | null;      // printed label when it differs from the index
  rotation: number;          // /Rotate: 0, 90, 180, 270
  layout: LayoutAssessment;
  paragraphs: PdfParagraph[];
}

interface PdfParagraph {
  text: string;
  kind: "heading" | "paragraph" | "table";
  heading: string | null;    // section heading, threaded across pages
  bbox: BBox | null;         // null when the text did not come from the layout
  source: "layout" | "model";
}
```

`kind` and `source` answer different questions — *what is this* versus *who decided*.
`"table"` is unreachable from the layout path: geometry cannot tell a table row from a
paragraph, which is precisely why such pages are routed to you.

### The detector (`src/lib/pdf/layout.ts`)

```ts
type LayoutReason = "vertical-split" | "wide-gaps" | "rotated" | "image-only";
interface LayoutAssessment {
  kind: "prose" | "complex";
  reasons: LayoutReason[];
  gutterWidth: number;    // points
  wideGapRatio: number;   // 0–1
}
```

`"vertical-split"` deliberately covers **both** two-column layouts and tables. They are
not separable by this measurement — on the corpus, the share of lines divided by the
band is 34% for a genuinely two-column page and 29–33% for pages whose only structure
is a table. Both route to you anyway. **Do not write a prompt that assumes columns**
("read the left column, then the right") — it would destroy a table.

### `threadHeadings(pages, title)` — exported, and you must call it

Assigns every paragraph the heading it sits under, carrying it across page boundaries.
It reads `kind`, not font size, specifically so it works on paragraphs that never had a
font size. **After merging model output you must re-run it over the whole document**,
otherwise model pages carry no heading and every page after one inherits from the wrong
place.

## What to build

### 1. `src/lib/rag/enrich.ts` (or similar — anywhere outside `lib/pdf`)

```ts
export async function enrichComplexPages(
  doc: PdfDocument,
  bytes: Uint8Array,
): Promise<PdfDocument>;
```

Do **not** put this in `src/lib/pdf`. That module is pure, dependency-light, and free of
network and API concerns; keeping it that way is a standing constraint.

It must **never throw**. Any failure — network, quota, validation, malformed response —
falls back to the layout paragraphs already on the page, per page, not per document.

### 2. The model response shape

Define once in **Zod 4** (already a project dependency, already used for message
metadata in `src/types/chat.ts`), convert to JSON Schema for the request, parse the
response with the same definition.

```ts
{
  pages: [{
    page: number,                    // echo of a page we asked for
    blocks: [{
      type: "heading" | "paragraph" | "table",
      text: string                   // Markdown for type "table"
    }]
  }]
}
```

- **One block per paragraph**, so chunk granularity stays comparable to the layout path.
- **One block for a whole table**, as Markdown — not one per row. A table split across
  chunks is useless for retrieval, and Markdown embeds and renders in a citation far
  better than flattened cells. Expect model pages to produce fewer, larger paragraphs
  than the layout path did.
- **Never ask the model for coordinates.** `bbox` is `null` for model paragraphs.
- `source: "model"` is set by your code, never by the model.

`blocks` is a wire and storage format. `PdfParagraph` is the runtime type. Map
`block.type → paragraph.kind` on read.

### 3. Three layers of validation — a schema only buys you the first

**Layer 1 — shape.** Use structured outputs (`output_config.format` with the JSON
schema). Note: **structured outputs and native `citations` are mutually exclusive** —
sending both returns a 400. Use structured outputs; citations are the wrong tool here.

**Layer 2 — page identity, structurally.** A schema guarantees `page` is a number, not
that it is the right one. You asked for pages `[3, 7]`; assert the returned set is
exactly `{3, 7}` and reject otherwise. **Never treat a model-reported page number as
truth.** A wrong page number means citing the wrong page with total confidence and
nothing detecting it.

**Layer 3 — faithfulness, which is free.** You already have the extracted text for that
page. Even on a scrambled two-column page every *word* is correct; only the order is
wrong. Compare word sets: if under ~90% of the layout text's words appear in the model
output, the model dropped or invented content — fall back to the layout paragraphs.

Exception: `image-only` pages have no extracted text to compare against, so Layer 3
cannot run there. Those are the pages you trust furthest with the least verification.

### 4. Cache — a Prisma model in Postgres

```prisma
model PageExtraction {
  fileHash  String   // sha256 of the PDF bytes
  page      Int      // 1-based, matches PdfPage.page
  model     String
  prompt    String   // hash of the prompt template
  blocks    Json     // the model's raw response, exactly as returned
  createdAt DateTime @default(now())

  @@id([fileHash, page, model, prompt])
}
```

- **Store the raw response, not the mapped paragraphs.** This is an audit log as much as
  a cache: model output is the least trustworthy thing in the pipeline and the only part
  you cannot reproduce by re-running code. When a citation looks wrong, this table
  answers whether the model or the chunker was at fault.
- **Per page, not per document** — tuning a detector threshold makes one more page
  complex, and you want to pay for that page only.
- **Upstream of chunking**, so changing chunk size or strategy costs nothing. This is
  where the money is during development, when the corpus is re-indexed repeatedly.
- **Hash the prompt template; do not hand-version it.** A `promptVersion: "v3"` string
  you have to remember to bump is a stale-cache bug waiting to happen.
- **Cache successes only.** A response that fails validation must not be written, or a
  bad batch poisons the document until someone notices.
- Keyed by content, not user. Two users uploading identical bytes share an entry — that
  is correct, since a hit requires already possessing the same file. Write it down; a
  table with no `userId` looks wrong to a reviewer otherwise.

Lookup happens in `enrichComplexPages`: filter out cached pages first, batch only the
misses.

### 5. The API call

- **Model: `claude-opus-5`.** These pages already defeated the geometry; extraction
  quality is the entire value. Take cost savings from batching, not from a smaller model.
- **Send the PDF directly.** Claude accepts PDF document blocks natively (base64), so
  there is no rendering step and no canvas dependency. `unpdf`'s `renderPageAsImage`
  needs an isomorphic canvas factory that is **not installed** — do not reach for it.
- **Use the Batches API.** Ingestion is asynchronous by definition; nothing waits on it.
  50% of standard pricing, results keyed by `custom_id` in arbitrary order — key by
  document id, never by position.
- **`@anthropic-ai/sdk` is not installed.** You need it: the project uses
  `@ai-sdk/anthropic` for the chat route, but the AI SDK does not expose the Batches
  API. Using both in one project is fine; they are different jobs.
- `ANTHROPIC_API_KEY` already exists in `.env`.
- Baseline real token counts with `count_tokens` against actual pages. Do not estimate.

**Cost trap to decide early:** a PDF document block sends the *whole* file. For the
2-page documents in `mock-data/pdf` that is nothing. For a 400-page manual with 3
complex pages you would pay for 400 pages of tokens to re-read 3. Above some page count
you need to extract just the wanted pages into a smaller PDF first — which requires a
PDF *writer* (`pdf-lib`), a dependency the project does not have. Pick a threshold
rather than discovering this on a large upload.

### 6. Merge

For each complex page whose response passed all three validation layers:

1. Replace `page.paragraphs` with the mapped blocks — `kind` from `block.type`,
   `heading: null`, `bbox: null`, `source: "model"`.
2. Leave every other page untouched.
3. Call `threadHeadings(doc.pages, doc.title)` over the merged document.

## Verification

**This repo has no test runner.** `scripts/` holds standalone `tsx` harnesses — follow
that pattern (`pnpm tsx scripts/<name>.ts`). Existing ones: `pdf.ts` (deterministic
pipeline), `layout.ts` (detector calibration), `fixtures.ts` (synthetic PDF generator),
`ingest.ts` (txt/md ingestion).

Test corpus: **15 real PDFs** in `mock-data/pdf`, **11 synthetic fixtures** in
`mock-data/pdf-fixtures` (rotation, PageLabels, `two-column`, `scanned`, `blank`).

Current detector state — **26 of 56 pages flagged (46%)**: `wide-gaps` 20,
`vertical-split` 7, `rotated` 4, `image-only` 1. Notable pages:

| Page | Verdict | What it is |
|---|---|---|
| `15-glossary.pdf` p1 | `vertical-split,wide-gaps` | genuinely two-column; its text is currently braided (`"Internal Glossary Idempotency key. An optional client-supplied"`) — the clearest before/after |
| `09-pricing-and-plans.pdf` p1 | `vertical-split,wide-gaps` | pricing table |
| `two-column.pdf` | `vertical-split` | synthetic paper, spanning title over an 18pt gutter |
| `scanned.pdf` | `image-only` | image operators, no text layer |
| `blank.pdf` | `prose` | no text, no image — must **not** route |

**Regression guard.** The deterministic path must not change. Hash every paragraph's
page, heading, and text across `mock-data/pdf` and compare — the current digest is
`82de7d63c1809ef8456a59c6cc511a64` (sha256, first 32 hex chars, over
`` `${page}|${heading}|${text}\n` `` per paragraph, documents sorted by filename). Also
holding: 15/15 non-null titles, 352 paragraphs, 76 of `kind: "heading"`, 0 out-of-bounds
bboxes.

Run `./node_modules/.bin/tsc --noEmit` and `./node_modules/.bin/eslint src scripts`.
Both are currently clean.

**Do not run `pnpm dev`** — it can hang this machine. Diagnose statically or with `tsx`
scripts.

## Out of scope — do not touch

- **`src/lib/pdf/*`** beyond reading it. It is pure and stays pure. The detector's
  thresholds are calibrated against measured data; the reasoning is in the comments.
- **Chunking, embedding, and search.** `ingestDocument` currently takes a flat `string`
  and splits on blank lines, so it cannot carry page attribution — changing it is known,
  planned, and someone else's task.
- **`semanticSearch` has its `userId` filter commented out** (`src/lib/rag/search.ts`),
  which is a real cross-user leak. Known. Not yours. Do not fix it as a drive-by.

## Style

Match the surrounding code. Comments explain *why* a non-obvious thing is done, aimed at
a first-time reader — not what changed relative to a previous version. No single-letter
variable names except `i` for a loop index. Functions that convert are named
`somethingToSomething`.
