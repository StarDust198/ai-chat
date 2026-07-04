# AI Chat

A streaming AI chat app built on the [Vercel AI SDK](https://ai-sdk.dev) and
[AI Elements](https://ai-sdk.dev/elements), focused on Anthropic's **Claude**
models. It supports multi-step tool calls, live model selection, persistent chat
history, and per-message token/cost tracking with prompt caching.

## Features

- **Streaming chat** with Claude, including multi-step tool calls (up to 5 steps
  per turn).
- **Live model picker** — the model list is fetched from Anthropic's
  `/v1/models` API, so new Claude releases appear without a code change.
- **Tools** — a calculator (`mathjs`), a weather lookup, and Anthropic's native
  web search.
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
- [TanStack Query](https://tanstack.com/query) 5 — client data fetching
- [Prisma](https://www.prisma.io) 7 with `@prisma/adapter-pg` + `pg` — Postgres
- [Clerk](https://clerk.com) 7 — authentication
- [Tailwind CSS](https://tailwindcss.com) 4
- [shadcn/ui](https://ui.shadcn.com) 4 on [Base UI](https://base-ui.com) (`@base-ui/react`)
- [Zod](https://zod.dev) 4
- [TypeScript](https://www.typescriptlang.org) 5

## Getting Started

**Prerequisites:** Node.js, [pnpm](https://pnpm.io), a Postgres database, a
[Clerk](https://clerk.com) application, and an
[Anthropic API key](https://console.anthropic.com).

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

Apply the database schema and start the dev server:

```bash
pnpm prisma migrate dev
pnpm dev
```

## Folder structure

- `src`
  - `app` — App Router. Route groups: `(auth)/chat` (the chat UI, protected),
    `(pre-auth)` (sign-in / sign-up / about), and `api/chat` (the streaming
    endpoint).
  - `components` — `ui` (shadcn on Base UI), `ai-elements` (AI SDK chat
    primitives), plus `chat`, `layout`, `form`, and `themes`.
  - `lib` — `actions` (server actions for chats), `api` (Anthropic REST client),
    `query` (TanStack Query hooks), `tools` (calc / weather / web search),
    `pricing` (cost estimation), and Prisma setup.
  - `types`, `schemas`, `constants`, `hooks`, `styles`.
  - `proxy.ts` — Clerk middleware (Next.js 16 renames `middleware` → `proxy`).
- `prisma` — schema and migrations.

## License

[MIT](LICENSE) © Sergey Zhilinsky
