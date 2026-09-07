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
- **Deploy**: `AWS_PROFILE=admin STAGE=<sveltia|prod> pnpm run deploy`
  (`pnpm run`, not `pnpm deploy` — pnpm has a built-in command by that name).
  Pushing to `sveltia` or `main` does this in CI; a local deploy is for
  infrastructure changes you want to see before pushing.

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
- `src/pages/robots.txt.ts` generates robots.txt from `STAGE`: production gets
  the real one, every other stage gets `Disallow: /` so the test domain is
  never indexed as a duplicate of the site. Unset `STAGE` means production.

### packages/cdk — AWS infrastructure

CDK in TypeScript, run with `tsx`. Account `063257577013`, us-east-1.
`STAGE` is `sveltia` or `prod`, and `src/index.ts` always synthesizes two
stacks:

- **`OrgHaitianReliefShared`** (`src/shared-stack.ts`) — account-wide, stage
  independent. Owns the GitHub Actions OIDC deploy role `hrs-website-deploy`,
  which trusts only `refs/heads/main` and `refs/heads/sveltia` of
  `tylerschloesser/hrs-website`. It holds `AdministratorAccess`: the trust
  policy is the control. Phase 3's CMS auth Lambda goes here.
- **`OrgHaitianRelief<Stage>`** (`src/site-stack.ts`) — S3 bucket
  `org.haitianrelief.<stage>`, its own hosted zone plus an NS delegation from
  the apex zone, an ACM cert, and the CloudFront distribution. The NS record is
  an explicit dependency of the certificate, because ACM validates over public
  DNS and cannot until the subdomain is delegated.

Things in `site-stack.ts` worth knowing before you change them:

- Content ships in **two** `BucketDeployment`s. `_astro/*` goes first, cached
  `immutable`, never pruned; everything else follows, `must-revalidate`, pruned,
  and invalidates `/*`. The second one's `exclude: ['_astro/*']` is what stops
  its prune from deleting the assets — `aws s3 sync --delete` applies excludes
  to the destination as well as the source.
- A viewer-request CloudFront Function rewrites `/foo/` → `/foo/index.html` and
  extension-less `/foo` → `/foo/index.html`. With `build.format: 'file'` almost
  every URL already has an extension; this is mainly what makes `/admin` work.
- Non-prod stages get `X-Robots-Tag: noindex, nofollow` on every response and a
  bucket that is destroyed with the stack.
- Construct ids match the old single-stack `CdkStack` so the live prod stack can
  be adopted in place at cutover. Renaming one replaces a live resource.

The old `OrgHaitianReliefStaging` and `OrgHaitianReliefProd` stacks are still
deployed and untouched by this code; `main` still deploys prod the old way until
cutover.

## Conventions

- Prettier: no semicolons, single quotes, 2-space indent, es5 trailing commas.
- `packages/app/src/content` is **prettier-ignored on purpose**: Sveltia CMS
  writes those files, and reformatting them would make every CMS commit fail
  `pnpm check`.
- Commit messages: all lowercase, short imperative ("add events", "fix
  prettier"). No conventional-commit prefixes.
- The root `.npmrc` maps `@fortawesome` to Font Awesome's registry and carries
  **no credential**. pnpm refuses to expand env vars in registry auth from a
  committed `.npmrc`; the token lives in `~/.npmrc` locally and comes from the
  `FONTAWESOME_PACKAGE_TOKEN` repo secret in CI.
