# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- **Deploy**: `AWS_PROFILE=admin pnpm run deploy`
  (`pnpm run`, not `pnpm deploy` — pnpm has a built-in command by that name).
  Pushing to `main` does this in CI; a local deploy is for infrastructure
  changes you want to see before pushing. If the CDK CLI says "no credentials
  have been configured" while the `aws` CLI works, the JS SDK has not picked
  up the SSO session — prefix with
  `eval "$(AWS_PROFILE=admin aws configure export-credentials --format env)"`.

## Architecture

Static site for haitianrelief.org: an Astro build on S3 + CloudFront, edited
through Sveltia CMS at `/admin/`, all in a pnpm workspace.

### packages/app — the Astro site

- `astro.config.mjs`: `build.format: 'file'` (pages emit `index.html`,
  `concert.html`, `404.html` — this is what keeps `/concert.html` working
  and makes the S3 keys obvious). `site` comes from `SITE_URL`, falling
  back to `https://haitianrelief.org` when it's unset — load-bearing for
  local builds, which don't set it.
- `src/content.config.ts`: the content schema. **This is the contract** between
  Astro and the CMS — the Sveltia config in `src/pages/admin/config.yml.ts`
  must define exactly the same fields, or an editor's save breaks the build.
  Change both together. `og_image_alt` is required alongside `og_image`,
  `contacts.members` must have at least one entry, and
  `events.share.redirect_to` must start with `/` (it reaches
  `location.replace()` in `concert.astro`, so an absolute value would be an
  open redirect). Each of the three is deliberately a Zod constraint rather
  than a defensive check in a component: a violation stops the build with a
  named `InvalidContentEntryDataError` instead of crashing a component on
  `undefined`.
- `tsconfig.json` sets `noUncheckedIndexedAccess`, so `astro check` (part of
  `pnpm check`) treats an unguarded array/object index as an error, not just
  a lint warning.
- `src/content/`: the content itself.
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
- `src/pages/robots.txt.ts` generates robots.txt at build time so the
  `Sitemap:` line follows whatever `site` the build was given.

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

`packages/app/scripts/` holds two files: `favicon.mjs` (above, dev-only,
never run in CI) and `validate-cms-config.mjs`, which `pnpm check` does run.

### packages/cdk — AWS infrastructure

CDK in TypeScript, run with `tsx`. Account `063257577013`, us-east-1.

**One stack, `HaitianReliefSite` (`src/site-stack.ts`), and no stages.**
`src/index.ts` synthesizes the one stack and passes it the apex zone.

If a test environment is ever wanted again, add it as a **separate app with
its own domain** rather than reintroducing a `STAGE` switch through every
construct — the stage conditionals were the biggest source of accidental
complexity in the old stack.

The stack owns the S3 bucket `org.haitianrelief`, the ACM certificate, the
CloudFront distribution, the apex DNS record, the GitHub Actions deploy role,
the CMS auth Lambda, and the canary and its alarm.

- **The site is served from the apex only.** There is no NS delegation to
  wait on, so nothing has to be delegated before ACM can validate —
  validation happens directly in the zone that already answers for the
  domain.
- **The apex hosted zone is imported by id, never created**
  (`Z0010048114HS2EOWXJLC`). Creating it would mint new nameservers and take
  the domain off the internet.
- Content ships in **two** `BucketDeployment`s. `_astro/*` goes first, cached
  `immutable`, never pruned; everything else follows, `must-revalidate`, pruned,
  and invalidates `/*`. The second one's `exclude: ['_astro/*']` is what stops
  its prune from deleting the assets — `aws s3 sync --delete` applies excludes
  to the destination as well as the source.
- A viewer-request CloudFront Function rewrites `/foo/` → `/foo/index.html` and
  extension-less `/foo` → `/foo/index.html`. With `build.format: 'file'` almost
  every URL already has an extension; this is mainly what makes `/admin` work.
- There is **no CSP**, on purpose — see the comment on the response headers
  policy. The Google Tag Manager bootstrap is inline and a static S3 origin
  can't mint a nonce, so any policy we could ship would need `unsafe-inline`.
- **CI deploys the stack that grants CI its own credentials.** The deploy role
  `hrs-website-deploy` trusts only `refs/heads/main` of
  `tylerschloesser/hrs-website` and holds `AdministratorAccess` — the trust
  policy is the control, not the permission set. If a bad change to that role
  ever lands, the fix is a local `AWS_PROFILE=admin pnpm run deploy`, not
  another push.
- **Renaming a stack replaces every resource in it**, and CloudFormation
  cannot do that in place. Named resources (the role, the bucket, the
  distribution's alias, the apex A record) collide with the originals, so a
  rename means deleting the old stack first and accepting the outage. Do not
  start one casually.

### CMS sign-in

Sveltia signs editors in through GitHub OAuth, and the code-for-token exchange
runs in `lambda/cms-auth/index.ts` (a port of `sveltia/sveltia-cms-auth`, MIT)
behind a Lambda Function URL. Two things will break sign-in silently:

- **A Function URL's hostname follows the function's _name_.** The function is
  therefore pinned to `functionName: 'hrs-cms-auth'` — an unnamed CDK function
  is named after its stack, so a stack rename would otherwise change the
  sign-in URL. With the name pinned, a future stack rename no longer touches
  it. If the name ever does change, two things outside CloudFormation have to
  change with it: the GitHub OAuth App's callback (`<url>/callback`), and the
  `CMS_AUTH_URL` Actions variable (`gh variable set CMS_AUTH_URL`), which is
  what `config.yml.ts` compiles into `base_url`. Nothing in any AWS log tells
  you when this is wrong; sign-in just fails.
- **`ALLOWED_DOMAINS`** (a Lambda env var) is the allow-list of sites that may
  start the flow. It is `haitianrelief.org` alone; another domain has to be
  added there or sign-in fails.

The client id and secret live in Secrets Manager under `hrs/cms-auth`, created
outside CloudFormation and imported with `fromSecretNameV2`, so `cdk destroy`
can never delete them.

### Monitoring

A daily CloudWatch Synthetics canary, `hrs-daily`, from
`packages/cdk/canary/index.js`. It loads `https://haitianrelief.org/` at 13:00
UTC and asserts three things: HTTP 200, an `h1` containing "Haitian Relief
Services", and at least one `.gallery img`. Its `SuccessPercent` alarms below
100% to the SNS topic `hrs-alerts`, with the OK action wired too so a recovery
is emailed as well.

- `canary/index.js` is **CommonJS on purpose**, despite `packages/cdk` being
  `"type": "module"` — it is zipped and run inside the Synthetics Lambda
  runtime, never loaded by local Node. The Playwright runtimes want the handler
  at the asset root (`index.js`), not the `nodejs/node_modules/` layout the
  Puppeteer runtimes need.
- The `.gallery img` assertion is a **contract with `ProjectGallery.astro`**,
  whose root element carries that class; `Lightbox.astro` is the only other
  consumer of it. Change or rename that class and the canary starts failing
  at 8am, not at build time.
- The `h1` assertion is a **contract with `site.name`**, which is
  CMS-editable: an editor changing the site name in `site.yml` to something
  that doesn't contain "Haitian Relief Services" fails the canary at 8am
  with no build-time warning, same shape as the `.gallery` contract above.
- **A newly created canary has no datapoints**, and the alarm uses
  `treatMissingData: BREACHING` — so it is born in ALARM and stays there until
  the first 13:00 UTC run. That is correct, not a fault. To settle it
  immediately, force one run: `stop-canary`, `update-canary --schedule
Expression='rate(0 minute)'`, `start-canary`, then restore
  `cron(0 13 * * ? *)` with `DurationInSeconds=0` and start it again. Check
  afterwards that `cdk diff` shows no canary drift.
- `aws synthetics get-canary-runs` returns runs under **`CanaryRuns`**, not
  `CanaryRunsStatus`. Querying the wrong key returns `None` rather than an
  error, which looks exactly like "the canary never ran".
- **Changing the alert email** means editing the `EmailSubscription` in
  `site-stack.ts` and deploying. SNS then emails the new address a
  subscription confirmation that someone has to click — until they do, alarms
  go nowhere. Recreating the topic (a stack rename does this) means a new
  confirmation too; `aws sns list-subscriptions` shows `PendingConfirmation`
  until it is clicked.
- `artifactsBucketLifecycleRules` on the `Canary` construct **does nothing**
  once you pass `artifactsBucketLocation`. The 30-day expiry lives on the
  explicit `CanaryArtifactsBucket` instead.

### Tearing down a stack in this account

Both times a stack here was deleted, the delete **failed on the hosted zone**
with `HostedZoneNotEmptyException`. The cause is an orphaned ACM validation
CNAME that CloudFormation does not consider its own. Delete every record in
the zone except `NS` and `SOA`, then re-issue the stack delete; it then
finishes in under a minute, because the slow part (disabling and deleting the
CloudFront distribution) already happened on the failed attempt.

S3 buckets in a deleted stack are **retained**, not destroyed, unless the
construct sets `removalPolicy: DESTROY` — so a teardown leaves orphaned
buckets behind that have to be emptied and deleted by hand.

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
