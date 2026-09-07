# Migration status

Live progress log for the migration described in `docs/migration-plan.md`.
Each phase appends its own section. Read this plus the plan before starting a
new phase.

| Phase                                     | State       | Notes                                                   |
| ----------------------------------------- | ----------- | ------------------------------------------------------- |
| 1 — repo reset, pnpm, Astro, content port | **done**    | local only, nothing deployed                            |
| 2 — infra and pipeline, test domain       | **done**    | https://sveltia.haitianrelief.org is live               |
| 3 — Sveltia CMS auth and round-trip       | not started |                                                         |
| 3.5 — photo quality pass                  | not started | **added 2026-09-06**; originals still to be asked about |
| 4 — UI redesign                           | not started | also adds Font Awesome icons                            |
| 5 — SEO, canary, docs                     | not started |                                                         |
| 6 — cutover and cleanup                   | not started |                                                         |

**Plan amended 2026-09-06** with two changes Tyler asked for after Phase 1:
Font Awesome Pro icons (plan §2.5) and a one-off photo restoration pass
(§2.6, new Phase 3.5). Both were researched and the toolchain validated before
the plan was written — see "Amendments" below.

Branch: `sveltia` (never commit to `main` before Phase 6).

## Commands

```sh
pnpm install                 # pnpm 11; npm will not work
pnpm dev                     # http://localhost:4321
pnpm build                   # -> packages/app/dist
pnpm preview                 # serve the built site
pnpm check                   # prettier + astro check + cms/schema parity + tsc -b packages/cdk
pnpm format
```

Every push to `sveltia` deploys https://sveltia.haitianrelief.org. `main` still
carries the _old_ `.github/workflows/deploy.yml` and still deploys prod the old
way — GitHub runs the workflow file from the pushed ref, so the two do not
interfere until the branches merge in Phase 6.

## Phase 1 — what was done

- Deleted webpack, Handlebars, jQuery, Semantic UI, Cypress and every
  `package-lock.json`. `packages/cypress-tests` is gone.
- pnpm workspace (`pnpm-workspace.yaml`, `packageManager: pnpm@11.25.0`),
  prettier 3 with `prettier-plugin-astro`, husky pre-push runs `pnpm check`.
- Astro 7.3.1 in `packages/app`: `output: static`, `build.format: 'file'`,
  `@astrojs/sitemap`, Tailwind v4 via `@tailwindcss/vite`, `sharp`,
  self-hosted Inter/Lora via `@fontsource-variable/*`.
- All content and images ported into `src/content/` (see the plan §2.2).
  Copy was transcribed verbatim and then diffed against the old
  `index.json`/`index.handlebars` programmatically.
- Pages and components built, including the `<dialog>` lightbox and the
  hamburger disclosure nav.
- `packages/cdk` left compiling but otherwise untouched:
  `webpack-manifest.ts` deleted, `defaultRootObject` stubbed to `'index.html'`.
- `CLAUDE.md` rewritten for the new stack.

## Phase 1 — decisions and gotchas

**Path spike (the Phase 1 blocker) — resolved, no workaround needed.**
Astro's `image()` resolves entry-relative paths **with or without** a leading
`./`, for both folder-collection markdown entries (`images/x.jpg`) and
singleton YAML entries (`media/y.jpg`). Both forms were built and produced the
same optimized asset. No Zod `.transform()` is required, and Phase 3 can let
Sveltia write paths in whatever style it prefers. The CMS config uses
`public_folder: media` (not `./media`) for singleton image fields.

**Singletons are four separate collections, not one `*.yml` glob.**
The plan called for a single `singletons` collection. A single collection needs
a Zod discriminated union, which needs a `type` discriminator field in every
YAML file — an extra hidden field Sveltia would have to write on every save,
and silently break the build if it ever dropped it. Instead `content.config.ts`
defines `site`, `home`, `events`, `contacts` as single-file collections and
`src/lib/content.ts` exposes `getSingleton('site'|'home'|'events'|'contacts')`.

**`pnpm-workspace.yaml` uses `allowBuilds`, and it is a map.** pnpm 11 renamed
pnpm 10's `onlyBuiltDependencies` list. Both the old key and a YAML _list_
under the new name are silently ignored, and `pnpm install` then exits 1 with
`ERR_PNPM_IGNORED_BUILDS` — which would fail CI. The working form is
`allowBuilds: {esbuild: true, sharp: true}`.

**`import { z } from 'astro:content'` is deprecated in Astro 7** (removed in 8)
and, more importantly, only exports `z` as a _value_, so `z.ZodRawShape` as a
type fails to compile. Use `import { z } from 'astro/zod'`, and type an
`image()` parameter as `SchemaContext['image']` from `astro:content`.

**Singleton markdown fields need their own renderer.** Project descriptions are
markdown bodies and use Astro's `render()`. The singleton `richtext` fields are
strings inside YAML, which Astro will not render, so `src/lib/markdown.ts`
wraps `marked`. (Astro 7's internal markdown package is
`@astrojs/markdown-satteri`, no longer `@astrojs/markdown-remark`; relying on
it directly would tie us to an Astro internal, so `marked` is a direct dep.)

**pnpm's strict `node_modules` exposed a missing `@types/node` in
`packages/cdk`.** It used to resolve through npm's flat hoisting. It is now a
direct devDependency. This only failed on a clean install — locally a stale
`tsconfig.tsbuildinfo` hid it — so _verify on a fresh clone_, not just in the
working tree.

**`packages/app/src/content` is prettier-ignored on purpose.** Sveltia writes
those files; if prettier reformatted them, every CMS commit would fail
`pnpm check` and break the deploy the editor just triggered.

**`pnpm check` includes a CMS/schema parity check.**
`packages/app/scripts/validate-cms-config.mjs` generates the CMS config,
parses it, and compares its field paths against a list mirroring
`content.config.ts`. This is the guard against the single most likely way to
break the site — the CMS config and the Astro schema drifting apart. It is not
JSON-schema validation of the CMS config itself; the plan assigns that to
Phase 3, and this script is where it should be added.

**Source images are small.** 27 of 45 are under 1000px wide (`gs1.jpg` is
858px; only the 2025/2026 board photos are large). Astro does not upscale, so a
gallery "full size" is often ~858px. That matches what the old lightbox served,
but it caps how good the redesign in Phase 4 can look on wide screens — new
photos uploaded through the CMS will be much better (capped at 2048px, not
858px).

**`pc2.jpg` exists twice on purpose** — as `media/pc2.jpg` (the hero) and as
`projects/pillowcase-dress-project/images/pc2.jpg` (a gallery item). They are
byte-identical, so Astro dedupes them to one optimized asset. A side effect:
that one gallery item's full-size image _is_ eagerly loaded, because the same
file is the hero. The other 34 are not.

**Deviations from the old site, all deliberate:**

- The viewport meta lost `maximum-scale=1.0`, which used to block pinch-zoom.
- The dead Universal Analytics tag (`UA-178061116-1`) was dropped. GTM stays,
  and its id now comes from `site.gtm_id` rather than being hardcoded.
- "We offer 3 method for donation:" → "We offer 3 methods for donation:". This
  line lives in `components/Donate.astro`, not in the content model — §2.2 has
  no field for it. Add one if editors should control it.
- `concert.html`'s `og:image` is emitted as JPEG, not WebP: some social
  scrapers still refuse WebP previews.
- Hand-made thumbnails (`public/images-sm/`, 35 files) and the two `-lq.jpg`
  downscales are deleted — the build pipeline replaces them.
- New copy that had no source: `site.tagline`, `site.description` (meta
  description), `home.hero_alt`, `events.image_alt`. Worth Tyler's review.

## Phase 1 — verification actually run

- On a **fresh clone of `origin/sveltia`** into a temp dir:
  `pnpm install`, `pnpm check` and `pnpm build` all exit 0. Do this after any
  dependency change; the working tree hides missing deps.
- Project copy diffed programmatically against the old `index.json`: titles,
  every description paragraph, every gallery caption and filename match
  byte-for-byte, curly quotes included.
- `dist/` contains `index.html`, `concert.html`, `404.html`, `admin/index.html`,
  `admin/config.yml`, `robots.txt`, `sitemap-index.xml`, `documents/`, and 108
  optimized `_astro/*.webp`. Total 11 MB (down from ~15 MB of raw JPEG).
- Playwright against `pnpm preview`:
  - all five anchors present exactly once; 35 gallery thumbnails; per-project
    counts 4/8/2/4/5/10/2/0 confirmed in the DOM.
  - lightbox: opens on Enter from a focused thumbnail, `:modal` (real top
    layer, backdrop covers the sticky nav), sets `src`/`srcset`/`sizes` only on
    open, arrow keys move within the gallery, Escape closes, `src` is cleared
    on close, focus returns to the originating thumbnail.
  - no full-size image is fetched before open (except the `pc2.jpg` case above).
  - mobile 375px: hamburger has `aria-expanded`/`aria-controls`, panel toggles
    via `hidden`, Escape closes and restores focus, no horizontal overflow.
  - zero console errors.
  - `/concert.html` redirects to `/#events`; OG/Twitter tags correct.
  - `/admin/` boots Sveltia 0.206.1, parses `config.yml` without error, and
    offers "Sign In with GitHub" / "Access Token" / "Work with Local
    Repository". Sign-in cannot work until the Phase 3 auth Lambda exists.

## Phase 2 — what was done

Live: **https://sveltia.haitianrelief.org**, deployed by GitHub Actions on every
push to `sveltia`.

- `packages/cdk` split into two stacks (`src/index.ts` synthesizes both;
  `STAGE` is now `sveltia | prod`, `dev`/`staging` are gone):
  - **`OrgHaitianReliefShared`** — the GitHub OIDC deploy role
    `arn:aws:iam::063257577013:role/hrs-website-deploy`, trusting
    `repo:tylerschloesser/hrs-website:ref:refs/heads/{main,sveltia}`. Phase 3's
    CMS auth Lambda goes in this file, at the marked placeholder.
  - **`OrgHaitianReliefSveltia`** — bucket `org.haitianrelief.sveltia`
    (DESTROY + autoDeleteObjects, non-prod only), hosted zone
    `sveltia.haitianrelief.org` + NS delegation, ACM cert, CloudFront
    `E1WLK7EZ5J25PC`, viewer-request URL rewrite, security headers,
    403/404 → `/404.html`, two `BucketDeployment`s.
  - `cdk-stack.ts` is gone, and with it the OIDC role that used to be inlined
    under `if (STAGE === 'staging')`. The old `hrs-github-actions-deploy` role
    still exists inside the untouched `OrgHaitianReliefStaging` stack; Phase 6
    deletes it with that stack.
- `.github/workflows/deploy.yml` rewritten: one job, pnpm, `pnpm check`,
  `pnpm build`, OIDC, `pnpm run deploy`. Stage/`SITE_URL`/`CMS_BRANCH` derive
  from `github.ref_name`. Concurrency group per branch, never cancelling.
- `robots.txt` is now generated (`src/pages/robots.txt.ts`) — non-prod stages
  get `Disallow: /` and no sitemap. Non-prod also gets an
  `X-Robots-Tag: noindex, nofollow` response header, so the test domain is
  unindexable even if a build somewhere forgets `STAGE`.
- Font Awesome registry plumbing is in place ahead of Phase 4: root `.npmrc`
  maps `@fortawesome` to `https://npm.fontawesome.com/` and holds **no** token;
  the repo secret `FONTAWESOME_PACKAGE_TOKEN` is set and CI writes it with
  `pnpm config set --location=user`. No `@fortawesome` package is installed
  yet, so the mapping is inert.
- `packages/cdk/cdk.context.json` is now tracked (see below), and the stale
  `.npmignore` / `*.js` / `!jest.config.js` ignore rules are gone.

### How to deploy, and how long it takes

```sh
AWS_PROFILE=admin STAGE=sveltia pnpm run deploy   # both stacks
```

`pnpm run`, not `pnpm deploy` — pnpm has a built-in command of that name. The
script is `cdk deploy --all --require-approval never`, so CI and a local deploy
take the same path.

Measured on the first (create) run: `OrgHaitianReliefShared` 28s. The cert was
ISSUED 2m14s after the site stack started, and the whole site stack took ~8.5
minutes — CloudFront is the long pole, not ACM. A subsequent content-only CI
run is ~45s of CDK on top of ~1m of install/check/build.

### Gotchas found in Phase 2

**The NS delegation has to exist before ACM validates.** CDK gives you no
ordering between the new hosted zone's NS record in the apex zone and the
certificate that validates against that zone, so ACM can sit pending while the
subdomain is not yet delegated. `site-stack.ts` makes the certificate depend on
the `NsRecord` explicitly. With that in place the cert issued in ~2 minutes.

**The two-`BucketDeployment` split works because `aws s3 sync --delete` applies
`--exclude` to the destination, not just the source.** The HTML deployment
prunes the whole bucket root while the assets deployment does not prune at all;
if excludes only filtered the source, the HTML deployment's prune would delete
every `_astro/*` object the assets deployment had just uploaded. Verified two
ways: the CDK handler
(`custom-resource-handlers/dist/aws-s3-deployment/bucket-deployment-handler/index.py`)
emits `--delete` before the `--exclude` filters, and a live sync against a
scratch prefix in the real bucket deleted a stale HTML object while leaving an
`_astro/` object that was absent from the source. Do not "simplify" this into
one deployment or drop the exclude.

**The CloudFront Function was verified with `aws cloudfront test-function`**,
not by reading it. `String.prototype.endsWith` does work on the JS 2.0 runtime.
Results: `/`→`/index.html`, `/admin`→`/admin/index.html`,
`/admin/`→`/admin/index.html`, and `/concert.html`, `/_astro/*.webp`,
`/documents/*.docx` all passed through untouched. Re-run that test after any
edit to the function — a runtime error there is a 503 on every request.

**`packages/cdk/cdk.context.json` was gitignored**, so the note in Phase 1 about
the apex hosted-zone lookup being "already cached" was only true locally; CI
resolved it live on every synth. It is tracked now.

**`pnpm deploy` is a built-in pnpm command.** It happens to fall through to the
root `deploy` script today, but do not rely on it — use `pnpm run deploy`.

### Verification actually run against the live domain

- 18/18 header and cache checks pass: http→https redirect; `index.html`
  `public, max-age=0, must-revalidate`; `_astro/*` `public, max-age=31536000,
immutable`; HSTS `max-age=31536000; includeSubDomains`, `nosniff`,
  `strict-origin-when-cross-origin`, `X-Frame-Options: DENY`,
  `X-Robots-Tag: noindex, nofollow`; `robots.txt` is `Disallow: /` with no
  sitemap line; `/concert.html` 200; `/admin` and `/admin/` both 200;
  `/nope` returns the 404 page with a real 404 status.
- Playwright against the live site: 35 gallery thumbnails; the lightbox opens as
  a real `:modal`, sets `src`/`srcset`/`sizes` only on open, moves on arrow
  keys, closes on Escape and clears `src`; the mobile nav at 375px toggles
  `aria-expanded`/`hidden` and closes on Escape; no horizontal overflow; zero
  console errors. `/concert.html` redirects to `/#events`.
- `/admin/` boots the Sveltia CMS shell and parses the served `config.yml`
  without error; it has `branch: sveltia` and no `base_url`, as expected until
  Phase 3. Sign-in still cannot work.
- The bucket holds 123 `_astro` objects plus 9 other keys, with the right
  cache-control on each.
- One green Actions run end to end (install → check → build → OIDC → deploy),
  including the Font Awesome registry auth step.

### Noticed, not fixed

- **The canonical URL is `https://<host>/index.html`**, not `https://<host>/`.
  That follows from `build.format: 'file'` and would make prod's canonical for
  the home page `https://haitianrelief.org/index.html`. Phase 5 (SEO) should
  decide whether to normalize it.
- The old `OrgHaitianReliefStaging` and `OrgHaitianReliefProd` stacks are
  untouched, as the plan requires. Prod is still served by the old
  distribution and still deployed by the old workflow on `main`.

## For Phase 3

- The CMS auth Lambda + Function URL go in `packages/cdk/src/shared-stack.ts`,
  at the marked placeholder. Once it exists, publish its URL with
  `gh variable set CMS_AUTH_URL` — the workflow already passes
  `vars.CMS_AUTH_URL` into the build, and `admin/config.yml` starts emitting
  `base_url` the moment it is non-empty. No workflow change is needed.
- Sveltia's `richtext` widget takes `modes: [rich_text, raw]` — _not_
  `rich-text`/`markdown`, which the plan suggested. The valid `buttons` values
  used are `bold, italic, link, bulleted-list, heading-three`, and the list
  widget's image preview key is `thumbnail`, not `field`. These were read out
  of the JSON schema bundled in `@sveltia/cms@0.206.1` rather than guessed, but
  they are unverified against a real editing session.
- **Unverified assumption**: that Sveltia treats the field named `body` in the
  `projects` collection as the markdown entry body. Confirm this before
  trusting it; if it instead writes `body:` into frontmatter, every project
  breaks. The local-repository mode (`/admin/` → "Work with Local Repository",
  Chrome only) is the fastest way to test config changes without deploying.
- Add real JSON-schema validation of `admin/config.yml` to
  `packages/app/scripts/validate-cms-config.mjs`.
- `logo_url` points at `/favicon.ico`, which Sveltia renders blurry. Phase 5
  adds `favicon.svg`; repoint it then.
- The attachment file widget writes to `/packages/app/public/documents` with
  `public_folder: /documents`, matching the `/documents/growin-proposal.docx`
  value in `clean-oil-farming`.

## Amendments (2026-09-06, after Phase 1)

### Font Awesome Pro — validated, with one trap

The token in `$FONTAWESOME_PACKAGE_TOKEN` resolves **Font Awesome 7.3.1 Pro**
against `npm.fontawesome.com` (checked live). `faPaypal`, `faVenmo`,
`faGithub` and `faYoutube` all exist in
`@fortawesome/free-brands-svg-icons@7.3.1` (brands ship free even for Pro
subscribers), and every UI icon the redesign needs exists in `pro-solid`. All
are single-path, so no duotone handling is needed. Both packages are
`sideEffects: false` ESM with per-icon deep imports, so tree-shaking will work.

**The trap, verified end-to-end:** Font Awesome's docs tell you to put
`//npm.fontawesome.com/:_authToken=${FONTAWESOME_PACKAGE_TOKEN}` in the project
`.npmrc`. **pnpm 11 refuses to expand it** — deliberately, because that file is
committed and a malicious edit could redirect the token to an attacker's
registry. You get a warning and then `ERR_PNPM_FETCH_401`. The repo `.npmrc`
must carry the registry mapping only; the credential has to come from the
user-level config (`~/.npmrc`, which Tyler already has) or from
`pnpm config set "//npm.fontawesome.com/:_authToken" <token> --location=user`,
which on macOS writes `~/Library/Preferences/pnpm/auth.ini`. The CI form is in
plan §2.5 and was tested with an isolated `HOME` and no `~/.npmrc`.

Consequence: the repo is public, and once `@fortawesome/*` is in the lockfile,
`pnpm install` 401s for anyone without a Pro token. Accepted and reversible.

### Photo quality — measured, and worse than "the images are small"

The 35 gallery images are two populations, not one (plan §2.6): 24 are 858px
wide and cleanly compressed (0.22–0.60 bytes/px), while 11 are _larger_
(1069–1080px) but severely JPEG-damaged (**0.07–0.13 bytes/px**) — all ten
`galette-chambon-orphanage-*` plus `hs1`, `hs2`, `pc4` and `mr2`. That second
group cannot simply be upscaled; the artifacts scale up with it. A 1080px cap
plus that compression level is the signature of a messaging app, so those
photos were most likely received over WhatsApp from Haiti.

Recommendation: hunt for originals first (free, best result, needs human lead
time — **start asking during Phase 2**), then Upscayl at 2× (free, local,
macOS; 2× is the range where it matches paid tools, and keeping photographs of
children off third-party cloud services matters here on its own), and only if
that falls short, one month of Topaz Gigapixel at $29 — it is subscription-only
now, so do not buy the year. No generative upscalers on documentary photos of
identifiable people. Realistic budget $0, worst case $29.

### Also noticed

The repo still carries GitHub secrets `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` from 2021-06-26 — long-lived static AWS credentials on
a public repo, superseded by OIDC and unused by the new workflow. Phase 6 now
deletes them and deactivates the underlying IAM access key.

## Manual steps for Tyler

- **Still open, and the longest lead time in the whole migration**: ask Joy
  Richards / Jeanette Juetten whether the original camera files or the original
  email attachments survive for the Galette Chambon orphanage and health-centre
  photos. This was Phase 2's manual step and has not been done; Phase 3.5 is
  much cheaper if the originals turn up, so ask now rather than at Phase 3.5.
- **Phase 3.5**: approve the before/after upscaling samples before the batch
  runs.
- Phase 3 needs a GitHub OAuth App and Phase 5 needs an SNS subscription
  confirmation; both are described in the plan.
