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
  — `prettier --check .` + `astro check` + the CMS config schema validation in
  `packages/app/scripts/validate-cms-config.mjs` + `tsc -b packages/cdk` + the
  `cms-auth` unit tests.
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
- `public/`: the favicon set, `documents/` and `admin/index.html` (the pinned
  Sveltia CMS loader). Anything that should be optimized belongs in
  `src/content/`, not here.
- `src/pages/robots.txt.ts` generates robots.txt from `STAGE`: production gets
  the real one (with the `Sitemap:` line), every other stage gets `Disallow: /`
  so the test domain is never indexed as a duplicate of the site. Unset
  `STAGE` means production.

Search and social metadata:

- `src/components/Seo.astro` owns the whole head: title, description,
  canonical, `theme-color`, the Open Graph set and the Twitter card. Pages get
  it through `Base.astro`; don't add meta tags to a page directly.
- **`build.format: 'file'` makes `Astro.url.pathname` `/index.html` on the home
  page.** `Seo.astro` strips that back to `/` for the canonical and `og:url`.
  Anything else deriving a public URL from the pathname needs the same
  treatment.
- `@astrojs/sitemap` does **not** know about `build.format: 'file'` and drops
  the `.html` from every URL it emits, so `/concert.html` would be listed as
  `/concert`, which 404s. The `filter` in `astro.config.mjs` excludes it (it is
  a `noindex` redirect page anyway); a future `.html` page that does belong in
  the sitemap needs the `serialize` option, not just `filter`.
- `src/components/JsonLd.astro` emits schema.org `NGO` on the home page only,
  built from `site.yml` and `contacts.yml` — no hard-coded names, addresses or
  emails.
- `concert.astro` deliberately does **not** use `Base`/`Seo`. It is a share
  card with its own OG tags from `events.share` plus an immediate redirect to
  `/#events`, and it duplicates the OG-image code on purpose.
- The OG image is generated at build from `site.og_image`, cropped to
  1200×630, and emitted as **JPEG** — some social scrapers still refuse WebP.
- The favicon set is generated from `public/favicon.svg` by
  `packages/app/scripts/favicon.mjs` (dev-only). Edit the SVG, re-run the
  script, commit the output. `sharp` cannot write `.ico`, so the script builds
  the container by hand.

Dev-only scripts under `packages/app/scripts/` (none of them run in CI):
`axe.mjs` (accessibility audit of a URL), `shots.mjs` (screenshots at the
review widths), `favicon.mjs` (above). `validate-cms-config.mjs` is the
exception — `pnpm check` runs it.

### packages/cdk — AWS infrastructure

CDK in TypeScript, run with `tsx`. Account `063257577013`, us-east-1.
`STAGE` is `sveltia` or `prod`, and `src/index.ts` always synthesizes two
stacks:

- **`OrgHaitianReliefShared`** (`src/shared-stack.ts`) — account-wide, stage
  independent. Owns the GitHub Actions OIDC deploy role `hrs-website-deploy`,
  which trusts only `refs/heads/main` and `refs/heads/sveltia` of
  `tylerschloesser/hrs-website`. It holds `AdministratorAccess`: the trust
  policy is the control. It also owns the CMS auth Lambda (below).
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
- There is **no CSP**, on purpose — see the comment on the response headers
  policy. The Google Tag Manager bootstrap is inline and a static S3 origin
  can't mint a nonce, so any policy we could ship would need `unsafe-inline`.

### CMS sign-in (`shared-stack.ts`)

Sveltia signs editors in through GitHub OAuth, and the code-for-token exchange
runs in `lambda/cms-auth/index.ts` (a port of `sveltia/sveltia-cms-auth`, MIT)
behind a Lambda Function URL. Two things will break sign-in silently:

- **The Function URL is derived from the function's logical id.** Renaming the
  `CmsAuthFunction` construct id gives a new URL, and the GitHub OAuth App's
  registered callback (`<url>/callback`) no longer matches. If the URL ever
  does change, update the OAuth App's callback **and** the `CMS_AUTH_URL`
  GitHub Actions variable (`gh variable set CMS_AUTH_URL`), which is what
  `config.yml.ts` compiles into `base_url`.
- **`ALLOWED_DOMAINS`** (a Lambda env var) is the allow-list of sites that may
  start the flow. A new stage domain has to be added there or sign-in fails.

The client id and secret live in Secrets Manager under `hrs/cms-auth`, created
outside CloudFormation and imported with `fromSecretNameV2`, so `cdk destroy`
can never delete them.

### Monitoring

Each stage gets a daily CloudWatch Synthetics canary, `hrs-<stage>-daily`, from
`packages/cdk/canary/index.js`. It loads `https://<stage domain>/` at 13:00 UTC
and asserts three things: HTTP 200, an `h1` containing "Haitian Relief
Services", and at least one `.gallery img`. Its `SuccessPercent` alarms below
100% to the SNS topic `hrs-<stage>-alerts`, with the OK action wired too so a
recovery is emailed as well.

- `canary/index.js` is **CommonJS on purpose**, despite `packages/cdk` being
  `"type": "module"` — it is zipped and run inside the Synthetics Lambda
  runtime, never loaded by local Node. The Playwright runtimes want the handler
  at the asset root (`index.js`), not the `nodejs/node_modules/` layout the
  Puppeteer runtimes need.
- The alarm's `.gallery img` assertion is a **contract with
  `ProjectGallery.astro`**. Change that container class and the canary starts
  failing at 8am, not at build time.
- **Changing the alert email** means editing the `EmailSubscription` in
  `site-stack.ts` and deploying. SNS then emails the new address a
  subscription confirmation that someone has to click — until they do, alarms
  go nowhere. A new stage means a new topic means a new confirmation.
- `artifactsBucketLifecycleRules` on the `Canary` construct **does nothing**
  once you pass `artifactsBucketLocation`. The 30-day expiry lives on the
  explicit `CanaryArtifactsBucket` instead.

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

## Other docs

- `README.md` — the public front door for the repo.
- `docs/editing.md` — the guide for the board members who edit the site. It is
  written for people with no technical background; keep it that way.
- `docs/migration-plan.md` / `docs/migration-status.md` — the migration spec
  and its live state.
