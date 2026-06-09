This is a personal starter template.

Stack:

- [Next.js](https://nextjs.org): "16.2.4",
- [React](https://react.dev): "19.2.4",
- [TypeScript](https://www.typescriptlang.org/): "5.9.3",
- [TailwindCSS](https://tailwindcss.com): "4.2.4",
- [shadcn/ui](https://ui.shadcn.com/): "4.6.0",
- [zod](https://zod.dev/): "4.4.1",

## Getting Started

Setup:

```bash
git clone git@github.com:StarDust198/starter-template.git
pnpm install
pnpm dev
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Folder structure

- `src` - source folder, inside it:
  - `app` - App router;
  - `components` - contains ui components and components related to features (notes/themes, etc);
  - `lib` - utils, server actions, and DB queries;
  - `styles` - styles, just `globals.css` for now. The App uses TailwindCSS for styling;
  - `types` - type declarations.

## What's missing

Omitted intentionally - `Prisma`, `Clerk` - add when needed
