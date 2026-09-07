# Migration status

Live progress log for the migration described in `docs/migration-plan.md`.
Each phase appends its own section. Read this plus the plan before starting a
new phase.

| Phase                                     | State       | Notes                                             |
| ----------------------------------------- | ----------- | ------------------------------------------------- |
| 1 — repo reset, pnpm, Astro, content port | **done**    | local only, nothing deployed                      |
| 2 — infra and pipeline, test domain       | **done**    | https://sveltia.haitianrelief.org is live         |
| 3 — Sveltia CMS auth and round-trip       | **done**    | oauth sign-in verified by Tyler 2026-09-06        |
| 3.5 — photo quality pass                  | **done**    | 21 photos upscaled 2x; 14 deliberately left alone |
| 4 — UI redesign                           | **done**    | axe clean; Lighthouse mobile 95/100/100 + SEO n/a |
| 5 — SEO, canary, docs                     | not started |                                                   |
| 6 — cutover and cleanup                   | not started |                                                   |

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
- Every run annotates: **"Node.js 20 is deprecated"** for `actions/checkout@v4`,
  `actions/setup-node@v4`, `aws-actions/configure-aws-credentials@v4` and
  `pnpm/action-setup@v4`. GitHub forces them onto Node 24 today, so runs are
  green; the pins are the versions the plan specifies. Bump them to v5 in a
  phase that has room to retest — `configure-aws-credentials@v5` changed inputs
  — rather than as a drive-by.

## Phase 3 — what was done

Editors can sign in at https://sveltia.haitianrelief.org/admin/, edit anything,
and see it live about **2m20s** later (measured, save → deployed).

- **`packages/cdk/lambda/cms-auth/index.ts`** — the GitHub half of
  [`sveltia/sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth)
  (MIT, Kohei Yoshino) ported to a Node 22 Lambda Function URL. GitLab was
  dropped. The `/auth` + `/callback` protocol, the CSRF cookie scheme and the
  `postMessage` handshake are preserved exactly — that handshake is what
  Sveltia's client expects, so do not "clean it up".
- **`packages/cdk/src/shared-stack.ts`** — `NodejsFunction` (ARM64, 256 MB,
  10s, one-month log retention) + Function URL (`authType: NONE`, no CORS),
  reading `hrs/cms-auth` from Secrets Manager.
- **`packages/cdk/lambda/cms-auth/index.test.ts`** — 12 `node:test` cases, run
  by `pnpm check` via `pnpm --filter @hrs-website/cdk test`.
- **`src/pages/admin/config.yml.ts`** — finished config (see the fixes below).
- **`scripts/validate-cms-config.mjs`** — now also validates the generated
  config against the JSON schema bundled in `@sveltia/cms`.
- **`docs/editing.md`** — first draft of the editor guide. Phase 5 finalizes it.

### The auth setup, and the one thing that must not change

| Thing              | Value                                                                        |
| ------------------ | ---------------------------------------------------------------------------- |
| Function URL       | `https://7fxcmotv2d3aaxnnfkrba4ikpq0ryofm.lambda-url.us-east-1.on.aws`       |
| OAuth App callback | `<that URL>/callback`                                                        |
| OAuth App owner    | Tyler (GitHub → Settings → Developer settings → OAuth Apps)                  |
| Client id/secret   | Secrets Manager `hrs/cms-auth`, us-east-1, JSON `{client_id, client_secret}` |
| Published to CI as | `gh variable set CMS_AUTH_URL` (already set)                                 |
| `ALLOWED_DOMAINS`  | `haitianrelief.org,sveltia.haitianrelief.org` (Lambda env var)               |

**The Function URL is derived from the function's logical id.** Renaming the
`CmsAuthFunction` construct id gives you a new URL and silently breaks the
OAuth App's registered callback. The secret is created outside CloudFormation
and imported with `fromSecretNameV2`, so `cdk destroy` can never delete it.

### Config fixes that were actually wrong before

Found by reading the bundled JSON schema and the docs, not from memory:

- **`type="module"` on the CMS script tag** — Sveltia is not distributed as an
  ES module. It logs a warning and says the attribute "may lead to unexpected
  behavior when using the JavaScript API". Removed.
- **`logo_url`** is deprecated in favour of `logo.src`.
- **`media_libraries.default.config`** is the backward-compatible form;
  `media_libraries.all` is current. Also added `svg.optimize` and
  `slugify_filename: true`.
- **`output.omit_empty_optional_fields: true`** — without it Sveltia writes
  `attachments: null`/`[]` for empty optional fields and Astro's Zod schema
  rejects the result. This is the single most likely way a CMS save breaks the
  build.
- **`auth_scope: public_repo`** — the default `repo` scope hands the OAuth app
  access to every private repository the signing-in editor owns. The repo is
  public, so `public_repo` is enough. Sveltia actually requests
  `public_repo,user`; the Lambda's allow-list passes both through.
- **`gallery: required: false`** — `clean-oil-farming` has no gallery, so
  without this an editor could not save that entry at all.
- **`commit_messages` without `{{collection}}`** — for a singleton
  `{{collection}}` resolves to the group label, giving
  `update Files "home"`. `{{slug}}` alone gives `update home` and
  `update ezekiel-village-water-cistern`, which matches the repo convention.
  (The commits already in the branch history predate this fix.)

### Round-trip verification actually run

Against the live test domain, signed in as Tyler:

- The sign-in screen loads with **zero config validation errors** — that is
  Sveltia validating the whole config against the schema for the version it is
  running, which is a stronger check than the offline one in `pnpm check`.
- **Project entry**: edited a caption, added a gallery row, uploaded a
  3200×2100 JPEG. It became `images/phase3-upload-test.webp` at exactly
  **2048px** — the transformations config works. The commit touched only
  content files, was authored as Tyler, and GitHub reports it **GPG-verified**
  (Sveltia signs commits; no configuration needed).
- **The diff was surgical**: only the changed caption line changed. No
  reformatting, no `attachments: []` inserted, markdown body untouched.
- **The `body` assumption from Phase 2 is confirmed**, both in the docs and in
  practice: a `richtext` field named `body` is written outside the front
  matter. Nothing else needs `body_field`.
- Astro then generated 5 responsive `_astro/phase3-upload-test.*.webp`
  variants; the live page went from 35 gallery thumbnails to 36, no broken
  images, and the lightbox opened the new photo as a real `:modal` with its
  caption.
- **Singleton + richtext**: edited `home.intro` through the Lexical editor and
  saved. Text survived byte-for-byte — no `_italic_` rewriting, no re-wrapping,
  curly quotes intact. See the one-time `|-` change below.
- Everything was reverted afterwards; `git diff` against the pre-test tree is
  empty apart from that `|-` change.

### Gotchas found in Phase 3

**The first CMS save of a singleton rewrites `|` to `|-` on every one of its
richtext fields.** Sveltia strips trailing whitespace from text values, so the
block scalar loses its trailing newline. It is one-time, permanent, harmless
(`marked` renders identically) — but it means the first commit an editor makes
to `home.yml` touches three fields when they edited one. Already absorbed for
`home.yml`; `events.yml` and `contacts.yml` will do it on their first save.

**Removing a gallery row does not delete the image file.** Sveltia only
auto-deletes entry-relative assets when the whole _entry_ is deleted. Removing
a list item leaves the file orphaned in the repo. Harmless — Astro never builds
an unreferenced image — but they accumulate. Editors can delete them from the
**Assets** tab; `docs/editing.md` says so.

**Existing repo images show a generic file icon instead of a thumbnail** in the
entry editor and the "Select Image" dialog. A freshly uploaded image previews
fine (blob URL), so this only affects assets already committed. The _values_
are correct and saving does not damage them — this is cosmetic — but it makes
"which photo is this?" hard for an editor. Worth reporting upstream or
re-testing on a newer `@sveltia/cms`.

**A list item can render with no subfields after a reload.** After returning to
an entry whose gallery had just grown, the third row rendered as bare controls
with no Image/Caption inside, while the list header still said "3" and
Sveltia's own file cache held all three items. Data was never at risk, and the
row could still be removed. Looks like a Sveltia rendering glitch; if you see a
blank row, reload before assuming content was lost.

**`esbuild` must be a direct devDependency of `packages/cdk`.** Under pnpm's
strict `node_modules`, `NodejsFunction`'s local-bundling detection resolves
`esbuild` starting from inside `aws-cdk-lib`'s own directory — which reaches
`packages/cdk/node_modules`. Without it CDK silently falls back to a much
slower Docker build.

**JSON-schema validation cannot catch a misspelled `widget`.** The schema
accepts any unknown widget name as a custom field type, because Sveltia lets
you register your own. A typo'd _option_ name is caught; a typo'd widget is
not. Widget names have to be checked against the docs by hand. This is noted in
the script.

**PKCE is still not an option for GitHub.** Sveltia's docs have the PKCE
instructions written and commented out: GitHub put client-side PKCE for SPAs on
hold, so the authorization-code flow plus our own OAuth client is the only
path. Revisit if GitHub ships it — it would let us delete the Lambda, the
secret and the OAuth App outright.

### Still open from Phase 3

- **Nothing blocking.** The OAuth round-trip was verified by Tyler on
  2026-09-06: "Sign In with GitHub" at `/admin/` completes, which exercises the
  `/callback` code-for-token exchange and the `postMessage` handshake that the
  unit tests can only approximate. Both sign-in methods now work.
- Housekeeping: the round-trip before that was driven with a `gh auth token`,
  which is stored in the test site's `localStorage` for that browser profile.
  Sign out from the CMS (bottom toolbar → Menu) and rotate it if you would
  rather not leave a `repo`-scoped token there.
- Board members still need GitHub accounts and collaborator invitations before
  they can use the CMS at all. That is the gating step for anyone but Tyler
  editing the site, and it has human lead time.

## Phase 3.5 — what was done

**21 of the 35 gallery photographs were upscaled 2x. The other 14 were
deliberately left alone.** Tyler reviewed the samples and agreed to both halves
on 2026-09-06.

Tool: **Upscayl 2.15.0**, model **`remacri-4x`**, run through its bundled CLI at
`/Applications/Upscayl.app/Contents/Resources/bin/upscayl-bin` with
`-s 2` — the 4x model output downsampled to 2x, which supersamples. Output was
re-encoded in place as mozjpeg q92, same filenames, so Git holds every original
and the whole batch is one revert.

### The measurement, corrected

Re-running §2.6's measurement against the current content gives **21 clean /
14 damaged**, not the 24/11 the plan's prose claims. The plan's own file list
was right and its counts were wrong: 10 `galette-chambon-orphanage-*` plus
`hs1`, `hs2`, `pc4` and `mr2` is 14, and 21 + 14 = 35.

### Why 14 photos were not touched

This is the part the plan got wrong, and it is worth not re-litigating later.
§2.6 assumed Group B was merely over-compressed and that a de-artifacting pass
would fix it. Those files are **also out of focus** — camera blur, not just
JPEG damage. No faithful upscaler can invent focus, so instead of recovering
detail the restoration models smooth what little is there:

- `high-fidelity-4x` turns a child's face into a smooth wax mask and the
  background into brushstrokes.
- A median-deblock pass before `high-fidelity-4x` — the plan's own suggestion —
  was the **worst** of the four results tested.
- `remacri-4x` was the only restrained one, but on these files it buys almost
  nothing while roughly doubling their bytes.

The plan's acceptance test settles it: slightly soft but true beats sharp but
wrong. If someone later wants to revisit this, the answer is not a better
model — it is a sharper original, and Tyler has confirmed none exists.

### Model comparison (the trial that produced the decision)

| Model                                | On clean files                        | On damaged files                 |
| ------------------------------------ | ------------------------------------- | -------------------------------- |
| **`remacri-4x`**                     | resolves real detail; faces unchanged | restrained; invents nothing      |
| `upscayl-standard-4x`                | cleaner, but fabric goes mushy        | smooths faces noticeably         |
| `high-fidelity-4x`                   | pleasant, softer than remacri         | waxy faces, painterly background |
| median deblock -> `high-fidelity-4x` | not needed                            | worst of the four                |

Samples were published as an artifact for review, with 100% crops and a
hold-to-compare against the original.

### Two files outside the gallery were included, on purpose

- **`media/pc2.jpg`** — the home page hero. It is byte-identical to
  `projects/pillowcase-dress-project/images/pc2.jpg` and Astro dedupes them to
  one optimized asset (Phase 1 noted this). Upscaling only one side would break
  the dedupe and produce two assets, so both were processed and verified
  byte-identical afterwards (`md5` matches). **If you ever touch one of these,
  touch both.**
- **`media/2026-mass-choir.jpg`** — 806px and cleanly compressed, i.e. Group A
  by every measure, and it is the live Events image.

**`media/2026-itav-og.jpg` was deliberately left at 1200x630.** That is the
size social scrapers expect from an Open Graph image; making it bigger would be
a regression, not an improvement. `2025-board.jpg` (4032px) and
`2025-mass-choir.jpg` (2452px) are already large and were skipped.

### The srcset rungs were previously dead

`ProjectGallery.astro` asked for `widths: [800, 1200, 1600]`, but Astro never
upscales — against an 858px source **every one of those rungs collapsed to
858**. The lightbox has been serving 858px images this whole time no matter
what the srcset said. With 1716px sources the ladder finally resolves:
`800w 1200w 1600w 1716w`.

A `2048` rung was added rather than the plan's `2400`: 2400 exceeds every
source we have, whereas 2048 is exactly the cap the CMS applies to uploads, so
it is the real ceiling for any photo an editor adds from now on. Astro clamps
it per image — 1716 for the upscaled files, 1080 for the untouched ones.

### Before / after

|                               | before     | after                  |
| ----------------------------- | ---------- | ---------------------- |
| Gallery sources               | 858px wide | 1716px wide (21 of 35) |
| `src/content` on disk         | 13 MB      | 18 MB                  |
| `dist/` build output          | 11 MB      | 22 MB                  |
| **Initial page image weight** | **971 KB** | **1053 KB** (+8%)      |
| One lightbox open, avg        | 85 KB      | 172 KB                 |

The number that matters is the initial page weight, and it barely moved: the
thumbnails are `width={400}` either way and only got slightly heavier from
being downsampled off a sharper source. The lightbox doubles in bytes for **4x
the pixels**, and only on open. `dist/` doubling is build output, not
transferred weight.

Gallery counts verified unchanged: 4/8/2/4/5/10/2/0.

## For Phase 4

- The photos are final. Judge the redesign against them.
- **Wide screens are now worth designing for.** The Phase 1 note that a gallery
  "full size" is often ~858px is obsolete for 21 of the 35 images; they are
  1716px. The 14 orphanage and health-centre photos are still 1080px and always
  will be, so the gallery layout has to look right with a mix — do not assume a
  uniform maximum.
- New photos uploaded through the CMS are capped at 2048px and converted to
  WebP in the browser before they are committed. Originals are never stored, so
  uploading a large original does not preserve it. If archival copies matter,
  they need to live somewhere other than this repo.

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
- Phase 3's GitHub OAuth App is **done** (created 2026-09-06). Phase 5 still
  needs an SNS subscription confirmation; it is described in the plan.
- **Phase 3 is fully closed** — OAuth sign-in verified 2026-09-06.
- ~~Ask about the original Galette Chambon camera files.~~ **Answered
  2026-09-06: no better images exist.** Phase 3.5 therefore runs the Upscayl
  route on the files we have; there is nothing left to recover.
- **Needed before any board member can edit**: their GitHub usernames, so they
  can be invited as collaborators.

## Phase 4 — what was done

The site was redesigned in place: **same copy, same section order, same
anchors**, new look. Live at https://sveltia.haitianrelief.org.

Structure of the page, top to bottom, with the band each section sits on:

| Section  | Anchor               | Band                    |
| -------- | -------------------- | ----------------------- |
| Nav      | —                    | `brand-dark`, sticky    |
| Hero     | —                    | `brand-dark`            |
| Events   | `#events`            | `surface` (white)       |
| Mission  | `#mission-statement` | `surface-alt` (blue-50) |
| Projects | `#projects`          | `surface`               |
| Contacts | `#contact`           | `surface-alt`           |
| Donate   | `#donate`            | `brand-dark`            |
| Footer   | —                    | `brand-dark`            |

The dark hero and the dark Donate/Footer close the page as a pair, and the
white/blue-50 alternation in between replaces the old divider lines. The one
decorative element is a short amber rule under every top-level heading — it
appears nowhere else, on purpose.

### Final token values

`packages/app/src/styles/global.css`. §2.4's palette, with one change:

| Token                    | Value     | Tailwind  |
| ------------------------ | --------- | --------- |
| `--color-ink`            | `#0f172a` | slate-900 |
| `--color-body`           | `#334155` | slate-700 |
| **`--color-muted`**      | `#475569` | slate-600 |
| `--color-surface`        | `#ffffff` | white     |
| `--color-surface-alt`    | `#eff6ff` | blue-50   |
| `--color-border`         | `#e2e8f0` | slate-200 |
| `--color-primary`        | `#1d4ed8` | blue-700  |
| `--color-primary-strong` | `#1e40af` | blue-800  |
| `--color-brand-dark`     | `#172554` | blue-950  |
| `--color-accent`         | `#fbbf24` | amber-400 |

Body type is Inter Variable at **17px, 18px from `lg` up**, line-height 1.7.
Headings are Lora Variable with `text-wrap: balance`. Shared classes:
`.shell` (max-w-6xl + responsive padding), `.band` (section rhythm),
`.rule` (the amber mark), `.prose-hrs` (rendered markdown), `.btn` +
`.btn-accent`/`.btn-primary`, and `.on-dark`.

### Deviations from §2.4, and why

- **`--color-muted` is slate-600, not slate-500.** Slate-500 on the blue-50
  band is **4.37:1** — under AA, and axe flags every caption sitting on
  `surface-alt`. Slate-600 is 6.9:1 there and 7.5:1 on white, and still reads
  clearly secondary to the slate-700 body text. This was found by running axe,
  not by inspection; §2.4's own contrast figures were all quoted against
  white.
- **`site.tagline` is now rendered** (in the hero, under the h1, in amber). It
  has existed in `site.yml` since Phase 1 and nothing displayed it. This is
  the only text that appears on the page that did not appear before — it is
  existing content, not new copy.
- **A skip link was added** (`Base.astro`, first focusable element, visible on
  focus). An affordance, not copy.
- **The project attachment moved.** Every project's attachments used to be
  collected into one lump rendered after all eight articles, which read as if
  it belonged to the last project. Each project's attachments now render
  inside its own `<article>`. Only `clean-oil-farming` has one.
- **The desktop nav breaks at `md` (768px), not `sm`.** "Haitian Relief
  Services" plus five items does not fit at 640px.
- **`.on-dark` is a required class, not decoration.** The focus ring is
  `--color-primary` (blue-700), which is invisible on the blue-950 bands, so
  `.on-dark` swaps it to amber and adapts prose/heading colours. Any new
  section with a `bg-brand-dark` must carry it.

### Icons (§2.5)

`@fortawesome/pro-solid-svg-icons` and `@fortawesome/free-brands-svg-icons`,
both 7.3.1. `pro-regular` was installed, went unused against the actual
design, and was removed — solid reads better at the small sizes here.

`src/components/Icon.astro` inlines the path data at build time. **No Font
Awesome runtime, no FA stylesheet, and no JavaScript ships for icons**: the
built `index.html` contains 12 inlined `<svg>` elements and `dist/_astro`
contains no `.js` at all. Icons in use: `faBars`, `faXmark`,
`faChevronLeft`/`Right`, `faMagnifyingGlassPlus`, `faEnvelope`, `faFileWord`,
`faArrowUpRightFromSquare`, `faPaypal`, `faVenmo`, `faGithub`, `faYoutube`.
The hand-pasted inline Venmo SVG is gone from `Donate.astro`.

**`Icon.astro` deviates from the snippet in §2.5 in one way**: it sets
`height="1em"` and derives `width` from the glyph's own aspect ratio.
Font Awesome glyphs are not square — Venmo is 640×512, YouTube 576×512 — and
forcing both dimensions to `1em` letterboxes the wide ones so they render
visibly smaller than the square icons beside them.

The registry auth from Phase 2 worked first time in CI, with no change to
`.npmrc` or the workflow.

### Verification actually run

Against **https://sveltia.haitianrelief.org** unless noted.

- **axe** (`packages/app/scripts/axe.mjs`, dev-only, not in CI): 375 / 768 /
  1280px, each also with the mobile nav panel open and with the lightbox open
  — axe cannot audit a closed `<dialog>`, so those states are scanned
  explicitly. Tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`,
  `best-practice`. **0 violations at any severity.** Run it with:

  ```sh
  pnpm --filter @hrs-website/app exec node scripts/axe.mjs <url>
  ```

- **Lighthouse mobile**: Performance **95**, Accessibility **100**, Best
  Practices **100**, SEO **69**. FCP 1.4s, TBT 0ms, CLS 0, total 409 KiB.
  **The SEO score is entirely `is-crawlable`** — the test domain deliberately
  serves `Disallow: /` plus `X-Robots-Tag: noindex, nofollow` (Phase 2), so it
  cannot score above ~70 there and no other SEO audit fails. Re-measure on
  prod at cutover; Phase 5 owns SEO regardless.
- **Screenshots** at 375/768/1280 plus a 320px overflow check
  (`packages/app/scripts/shots.mjs`): **0px horizontal overflow at every
  width including 320**, and **0 console errors**.
- **Keyboard walkthrough**, all passing: first Tab reaches the skip link;
  Enter on the hamburger opens the panel and sets `aria-expanded`; Escape
  closes it and returns focus to the toggle; clicking a link closes it; Enter
  on a gallery thumbnail opens the lightbox as a real `:modal` with the
  caption as its accessible name and a `1 / 4` position indicator; arrow keys
  move and wrap within that project's gallery only; Escape closes, clears
  `src`, releases the scroll lock and returns focus to the originating
  thumbnail.
- Gallery counts on the live page are unchanged: 4/8/2/4/5/10/2/0.
- `/concert.html` still redirects to `/#events`; `/404.html` still renders.

Screenshots are in the session scratchpad
(`.../scratchpad/live/`, `.../scratchpad/v3-1280/`, `.../scratchpad/v3-375/`),
not in the repo.

### Things worth knowing before changing this

**`ProjectGallery` ↔ `Lightbox` is a data-attribute contract.** Thumbnails are
`<button>`s carrying `data-full-src` / `data-full-srcset` / `data-caption`
inside a `.gallery` container; the lightbox delegates clicks from `document`
and uses `closest('.gallery')` to scope prev/next to one project. The full
image is produced at build time by `getImage()` but is never an `<img src>` on
the page, so **nothing full-size is fetched until the lightbox opens** — that
was re-verified after the redesign. Neighbours are prefetched afterwards, in
a `requestIdleCallback`, only once the current image has loaded.

**A gallery thumbnail's accessible name comes from its visible caption.** The
button has no `aria-label`, the `<Image>` has `alt=""`, and the magnifier icon
is `aria-hidden`, so the caption `<span>` is the whole name. Adding an
`aria-label` back would double it up.

**The lightbox prev/next buttons must stay over the image.** They were first
built translated outside the flex container at `sm` and up, which put them
outside the dialog box, where they were clipped and unusable on desktop.

**The latin font subsets are preloaded** in `Base.astro`
(`@fontsource-variable/*/files/*-latin-wght-normal.woff2?url`). The hero
paragraph is the LCP element, and with `font-display: swap` the swap to Inter
repainted it into a second, later LCP candidate. Preloading collapses that.

**Every `sizes` attribute subtracts `.shell`'s padding** (20px below `sm`,
32px from `sm` up) rather than claiming `100vw`. Lighthouse's
`uses-responsive-images` caught the over-fetch.

**`<Image>` with `width` alone emits no `srcset`**, which makes a `sizes`
attribute inert. Use `widths={[...]}` + `sizes`. Two components shipped with
`width={800}` + `sizes` before this was noticed.

### Still open from Phase 4

- **Tyler's sign-off on the look** is the one deliverable a machine cannot
  close: the phone and desktop layouts, the hamburger, and the lightbox on a
  real touch device.
- The **Events** section leaves a tall empty area to the right of its photo on
  wide screens — inherent to "two-column, image right" (§2.4) with a short
  image. The image is `lg:sticky` so it follows the text. If it still reads as
  a void, the fix is a layout change, not a tweak.
- **Lighthouse SEO on the test domain cannot pass**, by design (above).
- Lighthouse's `unused-javascript` and `legacy-javascript` findings are
  **Google Tag Manager**, not our code. We ship no JavaScript bundle at all.
