# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Migration in progress. `docs/migration-plan.md` is the spec and
> `docs/migration-status.md` is the live state — read both before doing
> anything substantial. Work happens on branch `sveltia` until cutover.

## Commands

Package manager is **pnpm** (see `packageManager` in `package.json`). npm will not work.

- **Install**: `pnpm install`
- **Dev server**: `pnpm dev` (Astro, http://localhost:4321)
- **Build**: `pnpm build` → `packages/app/dist`
- **Preview a build**: `pnpm preview`
- **All checks** (what the pre-push hook and CI run): `pnpm check`
  — `prettier --check .` + `astro check` + `tsc -b packages/cdk`
- **Format**: `pnpm format`
- **Deploy**: `AWS_PROFILE=admin STAGE=<stage> pnpm deploy`

## Architecture

Static site for haitianrelief.org: an Astro build on S3 + CloudFront, edited
through Sveltia CMS at `/admin/`, all in a pnpm workspace.

### packages/app — the Astro site

- `astro.config.mjs`: `output: static`, `build.format: 'file'` (pages emit
  `index.html`, `concert.html`, `404.html` — this is what keeps `/concert.html`
  working and makes the S3 keys obvious). `site` comes from `SITE_URL`.
- `src/content.config.ts`: the content schema. **This is the contract** between
  Astro and the CMS — the Sveltia config in `src/pages/admin/config.yml.ts`
  must define exactly the same fields, or an editor's save breaks the build.
  Change both together.
- `src/content/`: the content itself, and the only thing carried over from the
  old site.
  - `site.yml`, `home.yml`, `events.yml`, `contacts.yml` — singletons, each its
    own single-file collection. Read them with `getSingleton()` from
    `src/lib/content.ts`.
  - `projects/<slug>/index.md` — one folder per project, gallery images in
    `projects/<slug>/images/`, description in the markdown body.
  - `media/` — images used by the singletons.
- Image paths in content are **relative to the entry file** (`media/pc2.jpg`,
  `images/ev1.jpg`), with or without a leading `./`. Astro's `image()` schema
  helper resolves both, so every CMS-uploaded image goes through the Sharp
  pipeline at build. Never hand-resize an image into the repo.
- `src/lib/markdown.ts`: renders the markdown held in singleton `richtext`
  fields. Project descriptions are markdown bodies and use Astro's own
  renderer instead.
- `public/`: only `favicon.ico`, `documents/` and `admin/index.html` (the
  pinned Sveltia CMS loader). Anything that should be optimized belongs in
  `src/content/`, not here.

### packages/cdk — AWS infrastructure

CDK in TypeScript, run with `tsx`. Account `063257577013`, us-east-1.
S3 + CloudFront + Route53 per stage.

## Conventions

- Prettier: no semicolons, single quotes, 2-space indent, es5 trailing commas.
- `packages/app/src/content` is **prettier-ignored on purpose**: Sveltia CMS
  writes those files, and reformatting them would make every CMS commit fail
  `pnpm check`.
- Commit messages: all lowercase, short imperative ("add events", "fix
  prettier"). No conventional-commit prefixes.
