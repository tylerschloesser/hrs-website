# Migration status

Live progress log for the migration described in `docs/migration-plan.md`.
Each phase appends its own section. Read this plus the plan before starting a
new phase.

| Phase                                     | State       | Notes                        |
| ----------------------------------------- | ----------- | ---------------------------- |
| 1 — repo reset, pnpm, Astro, content port | **done**    | local only, nothing deployed |
| 2 — infra and pipeline, test domain       | not started |                              |
| 3 — Sveltia CMS auth and round-trip       | not started |                              |
| 4 — UI redesign                           | not started |                              |
| 5 — SEO, canary, docs                     | not started |                              |
| 6 — cutover and cleanup                   | not started |                              |

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

Nothing deploys yet — Phase 2 rewrites `packages/cdk` and the workflow. The old
`.github/workflows/deploy.yml` is still in place and **will fail on pushes to
`sveltia`**, because the existing deploy role trusts only `refs/heads/main`.
That is expected until Phase 2; `main` still deploys prod the old way.

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

## Decisions and gotchas

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

## Verification actually run

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

## For Phase 2

- Rewrite `packages/cdk` per plan §Phase 2. `cdk-stack.ts` is still the old
  single-stack file with the OIDC deploy role inlined under
  `if (STAGE === 'staging')`; that role must move to `SharedStack` before the
  staging stack can be destroyed in Phase 6.
- **`public/robots.txt` currently hardcodes the prod sitemap URL and allows
  indexing.** Once `sveltia.haitianrelief.org` is live it would invite Google
  to index a duplicate of the whole site. Phase 2 should make robots.txt a
  build-time endpoint that emits `Disallow: /` for any non-prod stage (and a
  correct `Sitemap:` from `SITE_URL`), or add an `X-Robots-Tag: noindex`
  response header on the test distribution.
- Build-time env the workflow must set: `SITE_URL`, `CMS_BRANCH`, and later
  `CMS_AUTH_URL`. `admin/config.yml` omits `base_url` entirely when
  `CMS_AUTH_URL` is unset, which is the current state.

## For Phase 3

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

## Manual steps for Tyler

None for Phase 1. Phase 3 needs a GitHub OAuth App and Phase 5 needs an SNS
subscription confirmation; both are described in the plan.
