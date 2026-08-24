# AI Chat

A streaming AI chat app built on the [Vercel AI SDK](https://ai-sdk.dev) and
[AI Elements](https://ai-sdk.dev/elements), focused on Anthropic's **Claude**
models. It supports multi-step tool calls, retrieval over a PDF document library,
live model selection, persistent chat history, and per-message token/cost tracking
with prompt caching.

## Features

- **Streaming chat** with Claude, including multi-step tool calls (up to 5 steps
  per turn).
- **Live model picker** — the model list is fetched from Anthropic's
  `/v1/models` API, so new Claude releases appear without a code change.
- **Tools** — a calculator (`mathjs`), a weather lookup, Anthropic's native web
  search, and `search_documents` for the document library below.
- **Document retrieval (RAG)** — PDFs are read geometrically from their text
  positions, and pages that geometry cannot handle (multiple columns, tables,
  scans) are re-read by Claude with structured outputs. The result is chunked,
  embedded, and stored in Postgres with `pgvector`. The model calls
  `search_documents` with a query it writes itself, so follow-up questions
  ("and what about the second one?") are resolved before anything is embedded.
  Every passage carries the document, page and heading it came from.
- **Chat history** — chats are persisted to Postgres; create, browse, and delete
  them from the sidebar.
- **Usage & cost tracking** — each assistant message shows token usage and an
  estimated cost, priced with prompt-caching (cache reads at 0.1×, writes at
  1.25×) taken into account.
- **Prompt caching** — an ephemeral cache breakpoint is set on the latest
  message to cut cost on multi-turn conversations.
- **Auth** — sign-in/sign-up and route protection via Clerk.
- **Rich markdown** — code, math, and Mermaid diagrams rendered with
  [Streamdown](https://streamdown.ai).
- **Light / dark themes**.

## Stack

Versions are pinned intentionally — this is **not** the Next.js you may know from
older docs (App Router with breaking changes).

- [Next.js](https://nextjs.org) 16.2.4 — App Router
- [React](https://react.dev) 19.2.4
- [AI SDK](https://ai-sdk.dev) (`ai`) 7 · `@ai-sdk/react` 4 · `@ai-sdk/anthropic` 4
- [AI Elements](https://ai-sdk.dev/elements) — chat UI primitives
- [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) —
  used directly for PDF page extraction (structured outputs, Batches API)
- [unpdf](https://github.com/unjs/unpdf) — PDF.js, for positioned text items
- [TanStack Query](https://tanstack.com/query) 5 — client data fetching
- [Prisma](https://www.prisma.io) 7 with `@prisma/adapter-pg` + `pg` — Postgres
- [pgvector](https://github.com/pgvector/pgvector) — embedding storage and
  cosine-distance search
- [Clerk](https://clerk.com) 7 — authentication
- [Tailwind CSS](https://tailwindcss.com) 4
- [shadcn/ui](https://ui.shadcn.com) 4 on [Base UI](https://base-ui.com) (`@base-ui/react`)
- [Zod](https://zod.dev) 4
- [TypeScript](https://www.typescriptlang.org) 5

Embeddings run through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
as `openai/text-embedding-3-small` (1536 dimensions).

## Getting Started

**Prerequisites:** Node.js, [pnpm](https://pnpm.io), a Postgres database with the
[pgvector](https://github.com/pgvector/pgvector) extension available, a
[Clerk](https://clerk.com) application, an
[Anthropic API key](https://console.anthropic.com), and an AI Gateway credential
for embeddings.

```bash
git clone git@github.com:StarDust198/ai-chat.git
cd ai-chat
pnpm install
```

Create your environment files with the following variables:

`.env`

```bash
DATABASE_URL=          # Postgres connection (pooled) — used by the app
DIRECT_URL=            # Postgres connection (direct) — used for migrations
ANTHROPIC_API_KEY=
```

`.env.local`

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/signin
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/signup
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/chat
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/chat
```

Embeddings additionally need an AI Gateway credential — either
`AI_GATEWAY_API_KEY`, or a `VERCEL_OIDC_TOKEN` obtained by linking the project and
running `vercel env pull`. Without one, ingestion fails at the embedding step.

Apply the database schema and start the dev server:

```bash
pnpm prisma migrate dev
pnpm dev
```

The first migration runs `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA
extensions`, so the database role needs rights to create it.

### Ingesting the document corpus

`mock-data/` holds fifteen sample documents as PDFs, and the same fifteen as plain
text. Ingestion is a script — there is no upload UI yet:

```bash
pnpm tsx scripts/ingest.ts --yes     # the PDFs
pnpm tsx scripts/verify.ts           # check what landed
```

`USER_ID` is hardcoded at the top of both scripts and must be set to your own
Clerk user id, or the documents will be ingested for a user who cannot search
them. Run `scripts/ingest.ts` with no flags to review each document as it goes,
`--only <name>` to try a couple first, and `--txt` or `--all` for the plain-text
copies. A first run sends complex pages to Claude and costs money; re-runs serve
those pages from the extraction cache.

`scripts/enrich.ts` inspects the extraction stage without spending anything: which
pages would be sent to a model, what the request looks like, and how the
validation layers handle a malformed response.

## Folder structure

- `src`
  - `app` — App Router. Route groups: `(auth)/chat` (the chat UI, protected),
    `(pre-auth)` (sign-in / sign-up / about), and `api/chat` (the streaming
    endpoint).
  - `components` — `ui` (shadcn on Base UI), `ai-elements` (AI SDK chat
    primitives), plus `chat`, `layout`, `form`, and `themes`.
  - `lib`
    - `pdf` — PDF reading: positioned text items → lines → paragraphs, plus
      running-header stripping and the layout assessment that decides which pages
      geometry cannot handle. A pure function of bytes: no network, no cost.
    - `extraction` — re-reads those pages with Claude. `sync.ts` for an upload
      someone is waiting on, `batch.ts` for a bulk re-index at half price,
      `shared.ts` for the selection, validation and caching both use.
    - `rag` — sources, chunking, embedding, storage, and semantic search.
    - `tools` — calc / weather / web search / `search_documents`.
    - `prompts` — the per-request system prompt.
    - `actions` (server actions for chats), `api` (Anthropic REST client),
      `query` (TanStack Query hooks), `pricing` (cost estimation), and Prisma
      setup.
  - `types`, `schemas`, `constants`, `hooks`, `styles`.
  - `proxy.ts` — Clerk middleware (Next.js 16 renames `middleware` → `proxy`).
- `prisma` — schema and migrations.
- `scripts` — standalone `tsx` harnesses: `ingest`, `verify`, `enrich`.
- `mock-data` — the sample corpus, as `pdf/` and `txt/`.

## Known bugs and limitations

- **Tool calls are not rendered.** The message renderer handles `text` parts only,
  so a search or a calculation happens invisibly — the answer appears with no sign
  of the work behind it.
- **Citations are not links.** A cited document and page appear only as text inside
  the model's answer; nothing links back to the source document.
- **No UI for choosing tools.** The server already supports it — a `sources` field
  on the request narrows `activeTools` per message — but the client never sends it,
  so every message runs with the full tool set.
- **`onEnd` is not awaited.** The stream's `onEnd` callback fires `saveChat` and
  drops the promise, so a failed save is silent and the message is lost.
- **Only the initial corpus is under RAG.** Documents are ingested by script
  against a hardcoded user id; nothing in the app adds to the library.

## Planned updates

- Let users upload their own documents and use them in chat through RAG.

## License

[MIT](LICENSE) © Sergey Zhilinsky
