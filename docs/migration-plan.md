# haitianrelief.org → Astro + Sveltia CMS migration plan

Written 2026-09-06. Companion to `docs/migration-prompt.md` (the original ask). Progress is tracked in `docs/migration-status.md` (created in Phase 1), which every phase updates so the next phase can start from a fresh context.

## 0. How to use this document

Each phase below is designed to run in a **fresh Claude Code session** with no memory of previous sessions. To start a phase:

1. `/clear`, then paste the phase's **Kickoff prompt** (verbatim, from the phase section).
2. Claude reads this plan and `docs/migration-status.md`, does the phase, delegates as much as possible to `sonnet` sub-agents, verifies, commits and pushes often, and finishes by updating `docs/migration-status.md` and reporting what Tyler needs to check.
3. Tyler verifies the phase's **Deliverables** (checklist), does any **Manual steps** listed, then starts the next phase.

Phase 3.5 was inserted on 2026-09-06 (photo quality); the other phase numbers
are unchanged so existing kickoff prompts still resolve.

Rules that apply to every phase (Claude must follow these):

- Work on branch `sveltia` (created in Phase 1). Never commit to `main` until Phase 6.
- Commit early and often with lowercase, short imperative messages (repo convention). Push after each meaningful step. The pipeline deploys `sveltia` to https://sveltia.haitianrelief.org on every push (from Phase 2 on).
- Use `AWS_PROFILE=admin` and `AWS_REGION=us-east-1` for any local AWS access. GitHub access is via `gh`.
- Delegate to sub-agents with `model: sonnet`. The orchestrator (main session) owns: reading the plan/status, splitting work, reviewing diffs, running verification, committing, and writing status. Sub-agents own: writing code/content for a clearly scoped set of files. Give each sub-agent the exact files it may touch, the acceptance criteria, and the relevant snippets from this plan. Run independent sub-agents in parallel.
- Verify with real tooling, not by reading code: `pnpm build`, `pnpm check`, Playwright (the `playwright-cli` skill or the Playwright MCP tools) against the local preview and the deployed test domain, screenshots at mobile and desktop widths, and axe for accessibility.
- Do not ask Tyler questions mid-phase unless truly blocked; make the reasonable call, note it in the status doc.
- Before finishing a phase: `docs/migration-status.md` must contain (a) what was done, (b) exact commands to build/run/deploy, (c) decisions and gotchas discovered, (d) what remains for the next phase, (e) any manual steps Tyler must do. Also keep `CLAUDE.md` accurate for the new stack as it changes.

## 1. Current state (inventory)

Everything below is being replaced except **content and images**.

- **Site**: one page (`packages/app/index.handlebars`) plus `concert.html` (a share page with Open Graph tags that redirects to `/#events`). Sections: intro, Events (It Takes a Village concert), Our Mission, Our Impact (8 projects, 7 with photo galleries), Contacts (3 board members + photo), Donate (PayPal, Venmo, mail), footer.
- **Content sources**: `packages/app/index.json` (projects: header, description paragraphs, images with captions) and copy hardcoded in `index.handlebars` (intro, events, mission, contacts, donate). Both must be ported.
- **Images**: `packages/app/public/` — 45 JPEGs, 15 MB total, largest 4032×3024 (`2025-board.jpg`, 3.1 MB). Hand-made 150px thumbnails in `public/images-sm/`. Only these are used by the current page: `pc2.jpg` (hero), `2026-mass-choir.jpg` (events), `2026-board.jpg` (contacts), and the gallery images listed in `index.json` (`ev*`, `gs*`, `ws*`, `pc*`, `mr*`, `galette-chambon-orphanage-*`, `hs*`). Unused files (`2025-*`, `staff.jpg`, `it-takes-a-village-*`, `2026-itav-poster.jpg`) may still be worth keeping as CMS media; `2026-itav-og.jpg` is used by `concert.html`.
- **Document**: `public/A GROWING Proposal.docx` (linked as "Download GROWIN Proposal").
- **Analytics**: Google Tag Manager `GTM-K4B3P5D`, plus a dead Universal Analytics tag (`UA-178061116-1`). Keep GTM, drop UA.
- **Build**: webpack + handlebars + Semantic UI (CDN) + jQuery (CDN). npm workspaces. Prettier check via husky pre-push.
- **Infra** (`packages/cdk`): one stack per `STAGE` (`OrgHaitianReliefStaging`, `OrgHaitianReliefProd`): S3 bucket (`org.haitianrelief.<stage>`), CloudFront + OAC, per-stage hosted zone `<stage>.haitianrelief.org` delegated from the apex zone `haitianrelief.org` (`Z0010048114HS2EOWXJLC`), ACM cert, `BucketDeployment`. **The staging stack also owns the GitHub OIDC deploy role `hrs-github-actions-deploy`** (trusts only `refs/heads/main`, AdministratorAccess). The account-level OIDC provider for `token.actions.githubusercontent.com` already exists and is not managed by any stack.
- **CI**: `.github/workflows/deploy.yml` on every push: prettier → build → deploy staging → Cypress smoke test against staging → deploy prod. The Cypress "suite" is one `cy.contains('Haitian Relief Services')`.
- **Account**: `063257577013`, us-east-1. AWS SSO profile `admin` works locally. Repo `tylerschloesser/hrs-website` is **public**.
- **Leftovers**: a local, unpushed `v3` branch (March 2026, Astro 5 + Tailwind v4 rewrite in `packages/app`). It is reference material only (mobile menu, OG image script); do not merge it. It uses paid Font Awesome Pro icons; **as of 2026-09-06 the new site does too** (see §2.5), so its icon usage is now fair reference. The `v2` branch and its `HaitianReliefServices` stack (v2.haitianrelief.org) were deleted on 2026-09-06.

## 2. Target architecture (decisions)

| Area            | Decision                                                                                                                                                                                                                                                                | Why                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | **Astro 7**, `output: 'static'`, `build.format: 'file'`                                                                                                                                                                                                                 | Built-in Sharp image pipeline, typed content collections that map 1:1 to a git CMS, zero JS by default. `format: 'file'` keeps `/concert.html` working and makes S3 paths obvious (`index.html`, `concert.html`, `404.html`, `admin/index.html`).      |
| CMS             | **Sveltia CMS** (`@sveltia/cms`, pinned version) at `/admin/`, GitHub backend, simple workflow (each save commits to the branch and triggers a deploy)                                                                                                                  | The ask. Pre-1.0 but very active (v0.206.x, Sept 2026). Ships a JSON schema and an official Claude Code plugin.                                                                                                                                        |
| CMS auth        | **GitHub OAuth** via a small **Lambda Function URL** (port of `sveltia-cms-auth`, MIT) in CDK. Keep `auth_methods: [oauth, token]` so a personal access token works as a fallback.                                                                                      | "Sign in with GitHub" is the only non-technical option. Sveltia's official proxy is Cloudflare-only; the protocol is two routes and easy to port. Keeps everything in CDK/AWS.                                                                         |
| Package manager | **pnpm 10** workspace: `packages/app` (Astro), `packages/cdk`                                                                                                                                                                                                           | The ask. `sharp`/`esbuild` need `pnpm-workspace.yaml` `onlyBuiltDependencies`.                                                                                                                                                                         |
| Styling         | **Tailwind CSS v4** via `@tailwindcss/vite`, tokens in `@theme`, self-hosted fonts via `@fontsource-variable/*`                                                                                                                                                         | Sonnet writes Tailwind reliably; the palette lives in one `@theme` block; no runtime CSS framework, no CDN, no Google Fonts request. (Alternative considered: scoped CSS + Open Props. Fine too, but Tailwind is the better fit for agent-written UI.) |
| Icons           | **Font Awesome Pro 7**, icon definitions from npm rendered as **inline SVG at build time** by a local `<Icon>` component. No `fontawesome-svg-core`, no FA CSS, no client JS.                                                                                           | Tyler holds a Pro licence. Rendering the path data directly keeps the zero-JS goal, ships only the icons actually used, and leaves full control of the SVG's a11y attributes. See §2.5.                                                                |
| Photos          | Source photos are too small and partly over-compressed; fixed by a one-off **local, faithful upscale** (Upscayl), not by a CMS feature. See §2.6.                                                                                                                       | 35 gallery images are 809–1080px, and a third of them are heavily JPEG-damaged. The redesign cannot look good against them.                                                                                                                            |
| Gallery         | Thumbnails via `<Image width={400}>`; full-size via `getImage({ width: 1600, widths: [800, 1200, 1600] })` emitted as `data-*` attrs; **native `<dialog>` lightbox** (no library) that sets `src`/`srcset` only on open, with prev/next, keyboard, swipe, focus restore | PhotoSwipe and GLightbox are both effectively unmaintained. `<dialog>` gives focus trap, Esc, and top-layer for free. Preserves "thumbnails on page, full image on open".                                                                              |
| Images in CMS   | Images live **next to their content** under `src/content/...` (entry-relative `media_folder`), so Astro's `image()` schema helper optimizes every CMS-uploaded image at build. Sveltia also converts uploads to **WebP, max 2048px** client-side.                       | Removes all manual resizing. Any image an editor uploads is optimized twice: once on upload (size cap), once at build (responsive variants).                                                                                                           |
| Hosting         | Same S3 + CloudFront + Route53 pattern, plus a CloudFront Function that rewrites `/` and `/admin` to `index.html`, and two `BucketDeployment`s (immutable cache for `_astro/*`, `must-revalidate` for the rest)                                                         | Keep CDK. `BucketDeployment` can't do per-path cache headers in one construct.                                                                                                                                                                         |
| Stacks          | `OrgHaitianReliefShared` (deploy role + CMS auth Lambda), `OrgHaitianReliefSveltia` (temporary test site), `OrgHaitianReliefProd` (updated in place at cutover)                                                                                                         | The deploy role must leave the staging stack before staging is deleted. One auth Lambda serves both domains (a GitHub OAuth App allows only one callback URL).                                                                                         |
| Pipeline        | One workflow: push to `sveltia` → deploy Sveltia stage; push to `main` → deploy prod. No staging, no test job. `prettier --check` + `astro check` + `tsc` as build gates.                                                                                               | The ask.                                                                                                                                                                                                                                               |
| Monitoring      | **CloudWatch Synthetics canary**, Playwright runtime, `cron` once a day, `SuccessPercent < 100` alarm (missing data = breaching) → SNS email                                                                                                                            | Real browser check, well under $1/month, doesn't auto-disable like GitHub scheduled workflows do after 60 idle days on a public repo. Route53 health checks can't run daily.                                                                           |
| SEO             | Hand-written `<Seo>` component (title, description, canonical, OG, Twitter), `@astrojs/sitemap`, static `public/robots.txt` (with `Disallow: /admin/`), JSON-LD `NGO`, generated 1200×630 OG image                                                                      | Small, dependency-free, agent-readable.                                                                                                                                                                                                                |

### 2.1 Target repo layout

```
.
├── .github/workflows/deploy.yml
├── CLAUDE.md                      # rewritten for the new stack (Phase 1, kept current)
├── docs/                          # migration-prompt.md, migration-plan.md, migration-status.md, editing.md (Phase 5)
├── package.json                   # root scripts: build, check, format, deploy
├── pnpm-workspace.yaml            # packages: packages/*; allowBuilds: {sharp: true, esbuild: true}
├── .npmrc                         # @fortawesome registry mapping ONLY, never the token (§2.5)
├── .prettierrc.yaml               # + prettier-plugin-astro
└── packages/
    ├── app/                       # Astro site
    │   ├── astro.config.mjs       # site, build.format 'file', tailwind vite plugin, sitemap
    │   ├── public/
    │   │   ├── admin/index.html   # Sveltia loader (pinned version), <meta name=robots content=noindex>
    │   │   ├── robots.txt
    │   │   ├── favicon.ico, favicon.svg, apple-touch-icon.png
    │   │   └── documents/growin-proposal.docx   # the GROWIN proposal (renamed, no spaces)
    │   └── src/
    │       ├── content.config.ts
    │       ├── content/
    │       │   ├── site.yml       # singleton: org info, donate methods, address, social/GTM ids
    │       │   ├── home.yml       # singleton: intro, hero image, mission, "why it matters"
    │       │   ├── events.yml     # singleton: concert section + share page (concert.html) fields
    │       │   ├── contacts.yml   # singleton: board members + board photo
    │       │   ├── media/         # images uploaded for the singletons above
    │       │   └── projects/<slug>/index.md + images/   # folder collection, one folder per project
    │       ├── pages/index.astro, concert.astro, 404.astro, admin/config.yml.ts
    │       ├── layouts/Base.astro
    │       ├── components/        # Icon, Nav, Hero, Events, Mission, Projects, ProjectGallery, Lightbox, Contacts, Donate, Footer, Seo, JsonLd
    │       └── styles/global.css  # @import "tailwindcss"; @theme { ... palette/fonts ... }
    └── cdk/
        ├── cdk.json, tsconfig.json, package.json
        ├── src/index.ts           # STAGE=sveltia|prod → SiteStack; always SharedStack
        ├── src/site-stack.ts      # bucket, CF distribution + function, cert, zone, deployments, canary
        ├── src/shared-stack.ts    # OIDC deploy role, CMS auth Lambda + Function URL
        ├── lambda/cms-auth/index.ts
        └── canary/index.js
```

### 2.2 Content model (Sveltia config ↔ Astro collections)

Field names are final; sub-agents should not invent others. All markdown fields use Sveltia's `richtext` widget (markdown on disk).

**`site.yml` (singleton, label "Site settings")**
`name` (string, "Haitian Relief Services"), `tagline` (string), `description` (text, used for meta description), `og_image` (image), `donate.paypal_url`, `donate.venmo_url`, `donate.mail` (object: `attn`, `street`, `city_state_zip`), `github_url`, `gtm_id` (string, default `GTM-K4B3P5D`).

**`home.yml` (singleton, "Home page")**
`intro` (richtext; the two founding paragraphs), `hero_image` (image; `pc2.jpg`), `hero_alt` (string), `mission` (richtext), `why_heading` (string, "Why Our Work Matters"), `why` (richtext).

**`events.yml` (singleton, "Events")**
`heading` (string, "It Takes a Village Annual Benefit Concert"), `body` (richtext), `image` (image; `2026-mass-choir.jpg`), `image_alt`, `videos` (list of `{label, url}`; the 3 YouTube links), `closing` (string, "Each year, music becomes ministry, and hope lingers on."), `share` (object: `title`, `description`, `image` (image; `2026-itav-og.jpg`), `redirect_to` default `/#events`) which drives `concert.html`.

**`contacts.yml` (singleton, "Contacts")**
`members` (list of `{name, role, email}`), `photo` (image; `2026-board.jpg`), `photo_caption` (string).

**`projects/<slug>/index.md` (folder collection, "Projects", `path: '{{slug}}/index'`, `media_folder: images`, `public_folder: images`, sortable by `order`)**
Frontmatter: `title`, `order` (number), `gallery` (list of `{image, caption}`), `attachments` (list of `{label, file}`; used by Clean Oil Farming for the GROWIN proposal, file field with `media_folder: files`). Body: the description paragraphs as markdown.
Slugs: `ezekiel-village`, `ganthier-school`, `ezekiel-village-water-cistern`, `pillowcase-dress-project`, `hurricane-matthew-relief`, `galette-chambon-orphanage`, `galette-chambon-health-center`, `clean-oil-farming`.

Astro side (`content.config.ts`): every collection uses the `glob()` loader (it handles `.md` and `.yml`), schemas use `({ image }) => z.object({...})` with `image()` for image fields. Singletons are a `glob({ pattern: '*.yml', base: './src/content' })` collection; read with `getEntry('singletons', 'site')`.

Path spike (do first in Phase 1): Sveltia writes entry-relative paths as `images/foo.jpg` (no `./`). Confirm Astro's `image()` resolves that relative to the entry file. If it does not, add `.transform()`/preprocess in the schema to prefix `./`, or set `public_folder: ./images` if Sveltia accepts it. Record the outcome in the status doc.

### 2.3 Sveltia config (`/admin/config.yml`, generated by `src/pages/admin/config.yml.ts`)

Generated at build so `branch` follows the deployed branch (`CMS_BRANCH` env from CI: `sveltia` on the test site, `main` after cutover) and `base_url` comes from `CMS_AUTH_URL` (the Lambda Function URL, from CI env/secret or CDK output). Skeleton:

```yaml
# yaml-language-server: $schema=https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json
backend:
  name: github
  repo: tylerschloesser/hrs-website
  branch: sveltia # CMS_BRANCH
  base_url: https://xxxx.lambda-url.us-east-1.on.aws # CMS_AUTH_URL
  auth_methods: [oauth, token]
site_url: https://sveltia.haitianrelief.org
display_url: https://sveltia.haitianrelief.org
logo_url: /favicon.svg
media_folder: packages/app/src/content/media
public_folder: /packages/app/src/content/media # for singletons; see note below
media_libraries:
  default:
    config:
      transformations:
        raster_image: { format: webp, quality: 85, width: 2048, height: 2048 }
        svg: { optimize: true }
singletons:
  - name: site # file: packages/app/src/content/site.yml ... fields per 2.2
  - name: home
  - name: events
  - name: contacts
collections:
  - name: projects
    label: Projects
    folder: packages/app/src/content/projects
    path: '{{slug}}/index'
    media_folder: images
    public_folder: images
    create: true
    sortable_fields: [order, title]
    fields: ... # per 2.2, body_field body widget richtext
```

Note on singleton media: global `public_folder` must be absolute (`/...`). For singleton image fields, set field-level `media_folder: /packages/app/src/content/media` and `public_folder: ./media` (relative to `src/content/*.yml`) so Astro's `image()` resolves them; if Sveltia rejects `./media`, use `media` and rely on the Phase 1 path spike result. `repo`-root-relative paths are needed because the CMS sees the whole monorepo.

CMS users: each editor needs a **GitHub account** invited as a **collaborator with write access** on `tylerschloesser/hrs-website` (public repo). Sveltia commits directly to the branch; each save is a commit and a ~5-minute deploy. Editors get a short guide in `docs/editing.md` (Phase 5).

### 2.4 Design direction and palette

Keep the "blue, white, black" identity, but warmer and with hierarchy. Adopt the **Tailwind v4 built-in scales** (no custom colors to maintain); tokens go in `@theme` in `global.css`:

| Token                    | Tailwind  | Hex       | Use                                               |
| ------------------------ | --------- | --------- | ------------------------------------------------- |
| `--color-ink`            | slate-900 | `#0f172a` | Headings, body text on light                      |
| `--color-body`           | slate-700 | `#334155` | Paragraph text                                    |
| `--color-muted`          | slate-500 | `#64748b` | Captions, meta                                    |
| `--color-surface`        | white     | `#ffffff` | Page background                                   |
| `--color-surface-alt`    | blue-50   | `#eff6ff` | Alternating section bands, cards                  |
| `--color-border`         | slate-200 | `#e2e8f0` | Rules, card borders                               |
| `--color-primary`        | blue-700  | `#1d4ed8` | Links, primary buttons (6.3:1 on white)           |
| `--color-primary-strong` | blue-800  | `#1e40af` | Hover/active                                      |
| `--color-brand-dark`     | blue-950  | `#172554` | Header/nav and footer background (replaces black) |
| `--color-accent`         | amber-400 | `#fbbf24` | Donate CTA background with `ink` text (≈11:1)     |

Alternative accent if Tyler prefers something with meaning: Haitian flag red `#D21034` for the Donate button only (white text, 5.9:1). Default is amber.

Typography: `Inter Variable` (body/UI) and `Lora Variable` (headings) from `@fontsource-variable`, system fallbacks. Type scale via Tailwind defaults; body 17–18px on desktop, generous line-height. Sections separated by alternating `surface`/`surface-alt` bands instead of divider lines. Rounded-lg images with a subtle border. Sticky top nav on `brand-dark` with the Donate button in `accent`; on mobile a hamburger `<button aria-expanded aria-controls>` disclosure (WAI-ARIA disclosure nav pattern, not `role=menu`), Esc closes and returns focus.

Structure and copy stay exactly as today (same section order, same anchors `#events`, `#mission-statement`, `#projects`, `#contact`, `#donate`, same wording). Only the look changes.

### 2.5 Icons (Font Awesome Pro)

Added 2026-09-06, replacing the original "no icon library" position. Tyler holds
a Font Awesome Pro subscription; the token is in `$FONTAWESOME_PACKAGE_TOKEN`
locally. Verified against the live registry on 2026-09-06: the token resolves
**Font Awesome 7.3.1 Pro**.

**Approach — inline SVG at build time, no runtime.** An icon definition is just
path data, so a ~10-line `src/components/Icon.astro` is the whole integration:

```astro
---
import type { IconDefinition } from '@fortawesome/fontawesome-common-types'
interface Props {
  icon: IconDefinition
  label?: string
  class?: string
}
const { icon, label, class: className } = Astro.props
const [width, height, , , path] = icon.icon
---

<svg
  viewBox={`0 0 ${width} ${height}`}
  width="1em"
  height="1em"
  fill="currentColor"
  class={className}
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
  focusable="false"
>
  {Array.isArray(path) ? path.map((d) => <path d={d} />) : <path d={path} />}
</svg>
```

Do **not** use `@fortawesome/fontawesome-svg-core`'s `icon().html`. It works,
but it needs FA's `.svg-inline--fa` stylesheet, adds a dependency, and emits
markup we then have to fight for accessible naming. The array branch above is
only needed if a duotone icon is ever used; every icon in §2.5's list is a
single path.

**Packages** (all `7.3.1`, all `sideEffects: false` with an ESM `index.mjs` and
per-icon deep imports, so Rollup ships only what is imported):

- `@fortawesome/pro-solid-svg-icons` — plus `pro-regular` / `pro-light` if
  Phase 4 prefers a lighter weight. Picking the weight is a Phase 4 call.
- `@fortawesome/free-brands-svg-icons` — brands are not part of Pro; they ship
  in the free package. `faPaypal`, `faVenmo`, `faGithub`, `faYoutube` all
  confirmed present in 7.3.1.

**Registry auth — the part that will waste an afternoon if skipped.** The repo
`.npmrc` must contain the registry mapping and _nothing else_:

```
@fortawesome:registry=https://npm.fontawesome.com/
```

Font Awesome's own docs tell you to add
`//npm.fontawesome.com/:_authToken=${FONTAWESOME_PACKAGE_TOKEN}` next to it.
**That does not work under pnpm 11.** pnpm deliberately refuses to expand
environment variables in registry credentials that come from a project-level
`.npmrc`, on the grounds that the file is committed and a malicious edit could
redirect the token to an attacker's registry. You get a warning and then
`ERR_PNPM_FETCH_401`. Verified 2026-09-06.

The credential has to come from a source pnpm trusts:

- **Locally**: Tyler's `~/.npmrc` already carries it, so local installs work
  today. `pnpm config set "//npm.fontawesome.com/:_authToken" <token>` also
  works and writes to `~/Library/Preferences/pnpm/auth.ini` on macOS.
- **In CI**: before `pnpm install`, run
  `pnpm config set "//npm.fontawesome.com/:_authToken" "${{ secrets.FONTAWESOME_PACKAGE_TOKEN }}" --location=user`.
  Verified end-to-end with an isolated `HOME` and no `~/.npmrc`.

**Consequence worth accepting deliberately**: `tylerschloesser/hrs-website` is
public. Once `@fortawesome/*` is in the lockfile, `pnpm install` fails with a
401 for anyone without a Pro token — the repo stops being buildable by
outsiders. That is fine for a site only Tyler maintains, and it is reversible:
switch to the `@fortawesome/free-*` packages and delete `.npmrc`.

**Icons to adopt.** Restores what Semantic UI used to provide, plus what the
redesign needs: PayPal, Venmo, GitHub, Word-document, envelope; hamburger,
close, chevron-left/right for the lightbox, external-link. Adopting `faVenmo`
lets `Donate.astro` drop the hand-pasted inline Venmo SVG carried over from the
old site.

### 2.6 Photo quality (one-off restoration pass)

Added 2026-09-06. Measured on the ported content, not estimated. The 35 gallery
images split into two populations:

| Group                        | Count | Size             | Bytes/pixel   | Files                                                                  |
| ---------------------------- | ----- | ---------------- | ------------- | ---------------------------------------------------------------------- |
| A — small but clean          | 24    | 858px wide       | 0.22–0.60     | `ev*`, `gs*`, `ws*`, `pc1–3`, `mr1`, `mr3–5`                           |
| B — larger but badly damaged | 11    | 1069–1080px wide | **0.07–0.13** | all 10 `galette-chambon-orphanage-*`, `hs1`, `hs2` (plus `pc4`, `mr2`) |

Group B is the trap: those files are _bigger_ than Group A and _much worse_.
0.07 bytes/pixel is severe JPEG damage — upscaling them without removing the
artifacts first just makes the blocking and ringing bigger. A 1080px cap with
that much compression is the signature of a messaging app, so the orphanage and
health-centre photos were most likely received over WhatsApp from Haiti.

**Priority 1 — find the originals. Free, best possible result, longest lead
time, so start it immediately rather than waiting for Phase 3.5.** If anyone
(Joy Richards, Jeanette Juetten, whoever travelled) still has the camera files
or the original email attachments for the Galette Chambon photos, one recovered
original beats anything an upscaler can do. Note that `2025-board.jpg` is
4032×3024, so full-resolution originals clearly do exist for _some_ photos.

**Priority 2 — Upscayl (free, open source, local, macOS) at 2×.** The default
recommendation, for three reasons:

- 2× is exactly the factor needed (858→1716, 1080→2160), and that is the range
  where Upscayl is reported to be on par with paid tools; the gap only opens up
  at 4×.
- It runs **entirely on the machine**. These are photographs of children in an
  orphanage — not handing them to a third-party cloud service is worth
  something on its own, independent of price.
- Free, batch mode. For Group B, run a de-artifact/restoration model first.

**Priority 3 — Topaz Gigapixel, one month at $29, only if Upscayl falls short
on the worst Group B images.** Topaz is subscription-only now ($29/month,
$149/year). For a one-off batch, buy a single month and cancel. Do not buy the
year.

**Do not use generative "creative" upscalers (Magnific, Krea) here.** They
invent detail — skin texture, facial features, apparent age. On documentary
photographs of identifiable children and named board members that is both
factually wrong and a dignity problem. Faithful reconstruction only.

**Workflow.** Upscale, overwrite the file in `src/content/**` keeping the exact
same filename, rebuild. Astro regenerates every derivative; no caption, config
or component changes. Git keeps the originals in history, so it is revertible.
Do not hand-make thumbnails — removing that chore is the point of the
migration. Acceptance is by eye at 100% in the lightbox on a retina screen,
against the original: **if a face looks _different_, keep the original.**
Slightly soft but true beats sharp but wrong.

**Budget: realistically $0, worst case $29.**

### 2.7 Cost

Everything new is inside free tiers or cents: Synthetics ~30 runs/month (first 100 free) plus a few cents of S3/Logs; Lambda Function URL auth calls are a handful per month; one more CloudFront distribution and hosted zone ($0.50/month) only while the test stack exists.

## 3. Phases

### Phase 1 — Repo reset: pnpm, Astro, content port (local only)

**Goal**: The site builds locally from Astro with all content and images ported into the content model, minimally styled. No infra changes yet.

Kickoff prompt:

```
Read docs/migration-plan.md fully and docs/migration-prompt.md. Execute Phase 1 exactly as written there. Create and work on branch `sveltia`. Delegate implementation to sonnet sub-agents with clearly scoped files; you orchestrate, verify, commit and push often. When done, write docs/migration-status.md per the plan's rules and report what I should verify.
```

Steps (orchestrator):

1. `git checkout -b sveltia` from `main`. Commit `docs/` first (`add migration docs`).
2. Path spike (do this before the big port, 15 minutes): scaffold Astro in a scratch dir or directly in `packages/app`, create one project entry with `gallery: [{ image: images/x.jpg, caption: ... }]` and confirm `image()` resolves the `./`-less path. Record the outcome in the status doc; it decides `public_folder` in Phase 3.
3. Remove webpack/handlebars/cypress: delete `packages/cypress-tests`, `packages/app/{webpack.config.js,index.handlebars,concert.handlebars,index.js,index.json,scripts,readme.md,package-lock.json}`, all `package-lock.json` files, `packages/cdk/src/webpack-manifest.ts` (Phase 2 rewrites CDK; leave the rest of `packages/cdk` compiling by stubbing `getDefaultRootObject` to return `'index.html'`).
4. pnpm workspace: root `package.json` (scripts `build`, `check` = prettier + `astro check` + `tsc -b packages/cdk`, `format`, `dev`, `deploy`), `pnpm-workspace.yaml` with `packages: ['packages/*']` and `onlyBuiltDependencies: [sharp, esbuild]`, `.npmrc` if needed, `packageManager` field pinned to the installed pnpm (`pnpm -v` locally is 11.25.0; if using pnpm ≥ 11 the key is `allowBuilds`, check `pnpm` docs for the exact key). Husky pre-push → `pnpm check`. Prettier: add `prettier-plugin-astro`, bump prettier to v3, keep `.prettierrc.yaml` style (no semi, single quotes, trailingComma es5).
5. Astro scaffold in `packages/app` (Astro 7, TypeScript strict, `@astrojs/sitemap`, `@tailwindcss/vite` + `tailwindcss`, `sharp`, `@fontsource-variable/inter`, `@fontsource-variable/lora`). `astro.config.mjs`: `site: process.env.SITE_URL ?? 'https://haitianrelief.org'`, `build: { format: 'file' }`, sitemap integration, tailwind vite plugin.
6. Content port (sub-agent A, parallel with 5): create `src/content/*.yml` and `src/content/projects/<slug>/index.md` per §2.2 with the **exact** copy from `index.handlebars` and `index.json` (verbatim text, including the typo-free version of "We offer 3 method for donation" → keep as-is except obvious typos may be fixed and noted). Move images: gallery images into `projects/<slug>/images/` (keep original filenames), `pc2.jpg`, `2026-mass-choir.jpg`, `2026-board.jpg`, `2026-itav-og.jpg` into `src/content/media/`, the docx into `public/documents/growin-proposal.docx` (also referenced from the clean-oil project's `attachments` as a file under `projects/clean-oil-farming/files/`; pick one and record it). Delete `public/images-sm` and unused originals from `public/`, but keep the unused source photos (`2025-*`, `staff.jpg`, `it-takes-a-village-*`, `2026-itav-poster.jpg`) in `src/content/media/` so editors can use them later. Use `git mv` to preserve history.
7. `content.config.ts` (sub-agent B): schemas per §2.2 with `image()`; `astro check` must pass with zero errors against the ported content.
8. Pages and components (sub-agent C, after A+B): `Base.astro` (GTM from `site.gtm_id`, fonts, global.css), `index.astro` rendering every section in the current order with current anchors, `concert.astro` (meta tags from `events.share`, meta-refresh + JS redirect to `redirect_to`), `404.astro`, `admin/config.yml.ts` returning YAML per §2.3 (auth `base_url` from `CMS_AUTH_URL`, may be empty for now), `public/admin/index.html` loading `@sveltia/cms` from unpkg **pinned to the version current at implementation time**, `public/robots.txt`. Gallery: `<Image width={400}>` thumbnails and `getImage()` full-size data attributes; a minimal `<dialog>` lightbox script (Phase 4 polishes it). Styling: only Tailwind base + `@theme` tokens from §2.4 and simple layout; the real design is Phase 4.
9. Verify: `pnpm install`, `pnpm build` (check `dist/` has `index.html`, `concert.html`, `404.html`, `admin/index.html`, `admin/config.yml`, `sitemap-index.xml`, `_astro/*.webp`), `pnpm check`, `pnpm --filter app preview` + Playwright: every section heading present, all 8 projects with correct image counts (4, 8, 2, 4, 5, 10, 2, 0), anchors work, `concert.html` redirects, no console errors, no requests to external hosts except googletagmanager.
10. Rewrite `CLAUDE.md` for the new stack (commands, layout, content model pointer to this plan, conventions). Write `docs/migration-status.md`. Commit + push (`push -u origin sveltia`). Note: pushing `sveltia` will trigger the old workflow, which fails on the OIDC trust check; that is expected until Phase 2.

Deliverables (Tyler verifies):

- [ ] `pnpm install && pnpm build && pnpm check` succeed on a clean checkout of `sveltia`.
- [ ] `pnpm dev` shows the whole site: same sections, same copy, all images, gallery opens full images.
- [ ] No webpack/handlebars/cypress/jquery/semantic-ui/npm lockfiles remain.
- [ ] `docs/migration-status.md` and `CLAUDE.md` describe the new stack.

### Phase 2 — Infrastructure and pipeline: test domain live

**Goal**: https://sveltia.haitianrelief.org serves the Astro build, deployed by GitHub Actions on every push to `sveltia`. Deploy role moved out of the staging stack.

Kickoff prompt:

```
Read docs/migration-plan.md and docs/migration-status.md. Execute Phase 2 as written. Work on branch `sveltia`, delegate to sonnet sub-agents, verify with real deploys (AWS_PROFILE=admin) and Playwright against the live test domain, commit and push often, and finish by updating docs/migration-status.md and CLAUDE.md.
```

Steps:

1. CDK rewrite (sub-agent, `packages/cdk` only), keeping `aws-cdk-lib` current:
   - `src/index.ts`: `STAGE` ∈ `sveltia | prod`; always instantiate `SharedStack` (`OrgHaitianReliefShared`); instantiate `SiteStack` (`OrgHaitianRelief<Stage>`) for the stage. Keep `env` account/region hardcoded.
   - `shared-stack.ts`: import the existing OIDC provider by ARN; `iam.Role` `hrs-website-deploy` with `WebIdentityPrincipal`, `StringEquals` aud `sts.amazonaws.com`, `StringLike` sub in `[repo:tylerschloesser/hrs-website:ref:refs/heads/main, ...:refs/heads/sveltia]`, `AdministratorAccess` (accepted tradeoff; trust policy is the control). Output the ARN. The CMS auth Lambda is added here in Phase 3; leave a clear placeholder.
   - `site-stack.ts`: bucket `org.haitianrelief.<stage>` with `removalPolicy: DESTROY` + `autoDeleteObjects: true` for non-prod; hosted zone `<stage>.haitianrelief.org` + NS delegation in the apex zone (lookup, already cached in `cdk.context.json`); ACM cert (prod also covers apex, as today); CloudFront Function (JS 2.0, viewer-request) rewriting `uri` ending in `/` → `+index.html` and extension-less → `+/index.html`; `defaultRootObject: 'index.html'`; `errorResponses` 403/404 → `/404.html` (404); security headers via `ResponseHeadersPolicy.SECURITY_HEADERS` or a custom policy (HSTS, nosniff, referrer-policy; no CSP yet); two `BucketDeployment`s from `../app/dist` (`_astro/*` immutable + `prune: false`; everything else `public, max-age=0, must-revalidate` + `prune: true` + `distributionPaths: ['/*']`); A record(s). Phase 5 adds the canary here.
   - Remove `webpack-manifest.ts` and the old inline OIDC block. `tsx` stays as the CDK app runner.
2. Deploy `SharedStack` locally first (`AWS_PROFILE=admin STAGE=sveltia pnpm --filter cdk exec cdk deploy OrgHaitianReliefShared`), then `OrgHaitianReliefSveltia` locally once (`SITE_URL=https://sveltia.haitianrelief.org CMS_BRANCH=sveltia pnpm build` first). Expect 10–20 minutes for cert validation + CloudFront.
3. Font Awesome registry plumbing (do it here, with the other CI secrets, so Phase 4 cannot trip over it — a `.npmrc` registry mapping is inert until the packages are added). Create `.npmrc` at the repo root containing only `@fortawesome:registry=https://npm.fontawesome.com/`; set the repo secret with `gh secret set FONTAWESOME_PACKAGE_TOKEN --body "$FONTAWESOME_PACKAGE_TOKEN"`. See §2.5 for why the token must not go in `.npmrc`.
4. Workflow rewrite (`.github/workflows/deploy.yml`): trigger on push to `main` and `sveltia`; `pnpm/action-setup` (version from `packageManager`) → `actions/setup-node@v4` (node 22, `cache: pnpm`) → `pnpm config set "//npm.fontawesome.com/:_authToken" "${{ secrets.FONTAWESOME_PACKAGE_TOKEN }}" --location=user` → `pnpm install --frozen-lockfile` → `pnpm check` → build with `STAGE`/`SITE_URL`/`CMS_BRANCH` derived from `github.ref_name` (`sveltia` → sveltia stage, `main` → prod) → `aws-actions/configure-aws-credentials@v4` with the **new** role ARN → `cdk deploy --all --require-approval never`. Concurrency group per branch. `CMS_AUTH_URL` comes from a repo variable (`gh variable set CMS_AUTH_URL`) set in Phase 3.
5. Push, watch the run (`gh run watch`), fix until green. Verify live with Playwright: `https://sveltia.haitianrelief.org/`, `/admin` (loads the Sveltia UI shell; sign-in will fail until Phase 3), `/concert.html` redirect, `/nope` → 404 page, `curl -I` shows `cache-control` immutable for an `_astro` asset and `must-revalidate` for `index.html`, HTTPS redirect, response headers policy present.
6. Do **not** touch `OrgHaitianReliefStaging` or `OrgHaitianReliefProd` yet. `main`'s old workflow keeps working for prod hotfixes until Phase 6.
7. Update `CLAUDE.md` (deploy commands, stack names) and `docs/migration-status.md` (include the new role ARN, stack names, how to deploy locally, and how long CloudFront changes take).

Deliverables:

- [ ] Push to `sveltia` → green Actions run → https://sveltia.haitianrelief.org updated.
- [ ] `OrgHaitianReliefShared` exists with role `hrs-website-deploy`; old staging/prod stacks untouched.
- [ ] Cache headers, 404 page, `/admin` and `/concert.html` behave as listed above.

### Phase 3 — Sveltia CMS: auth, config, editing round-trip

**Goal**: Editors can sign in with GitHub at https://sveltia.haitianrelief.org/admin/, edit any content or image, save, and see the change live after the deploy.

Manual step for Tyler (Claude will stop and ask for this once the Function URL exists): create a GitHub **OAuth App** (Settings → Developer settings → OAuth Apps → New): name `Haitian Relief Services CMS`, homepage `https://haitianrelief.org`, callback `<function-url>/callback`. Give Claude the Client ID and Client Secret (or store the secret yourself: `aws secretsmanager create-secret --name hrs/cms-auth --secret-string '{"client_id":"...","client_secret":"..."}'`).

Kickoff prompt:

```
Read docs/migration-plan.md and docs/migration-status.md. Execute Phase 3 as written. Before writing the Sveltia config, fetch https://sveltiacms.app/llms.txt and read the pages on the GitHub backend, singletons, entry collections, image/file fields, internal media and transformations (or use the sveltia-cms plugin skill if installed). Work on branch `sveltia`, delegate to sonnet sub-agents, verify the full editing round-trip on the live test domain, commit and push often, and finish by updating docs/migration-status.md.
```

Optional prep: install Sveltia's official Claude Code skill so sub-agents can use it: `/plugin marketplace add sveltia/ai-tools` then `/plugin install sveltia-cms@sveltia`.

Steps:

1. Auth Lambda (sub-agent, `packages/cdk/lambda/cms-auth/index.ts` + `shared-stack.ts`): port `sveltia-cms-auth` (`https://github.com/sveltia/sveltia-cms-auth`, MIT; keep the attribution) to a Node 22 Lambda Function URL handler: `GET /auth?provider=github&site_id=<host>` validates `site_id` against `ALLOWED_DOMAINS` (`haitianrelief.org,sveltia.haitianrelief.org`), sets a short-lived HttpOnly CSRF cookie, redirects to `https://github.com/login/oauth/authorize` with scope `repo`; `GET /callback` verifies state, exchanges the code with `GITHUB_CLIENT_SECRET`, returns the tiny HTML page that `postMessage`s `authorization:github:success:{"provider":"github","token":"..."}` to the opener (mirror the original's handshake exactly, including the initial `authorizing:github` message exchange). Read client id/secret from Secrets Manager `hrs/cms-auth` at cold start (grant `secretsmanager:GetSecretValue`). `NodejsFunction` with `depsLockFilePath` at the workspace `pnpm-lock.yaml`, `esbuild` as a devDependency so bundling is local, `authType: NONE`, `CfnOutput` the URL. Unit-test the handler with a couple of `node --test` cases (state mismatch, disallowed domain) since it is security-relevant.
2. Deploy `OrgHaitianReliefShared`; get the URL; ask Tyler for the OAuth App (see manual step); store the secret; `gh variable set CMS_AUTH_URL --body <url>`.
3. Sveltia config (sub-agent, `src/pages/admin/config.yml.ts` + `public/admin/index.html`): full config per §2.2/§2.3 with labels, hints, `required` flags, `sortable_fields`, `thumbnail` for projects (`gallery.*.image`), `richtext` with a limited button set (bold, italic, link, bulleted list, headings 3), image transformations, `auth_methods: [oauth, token]`, `logo_url`. Validate against the JSON schema (`https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json`) with a small script in `packages/app/scripts/validate-cms-config.mjs` wired into `pnpm check`.
4. Push, then verify the round-trip on the live site with Playwright where possible and manually where OAuth popups block automation: sign in with GitHub as Tyler → edit a project caption → save → `gh run watch` → caption changed on the live page; upload a new photo to a project gallery → it lands in `projects/<slug>/images/*.webp` ≤ 2048px → renders with thumbnail + lightbox after deploy; edit `home.intro`; confirm commits are authored sensibly and touch only content files.
5. Write `docs/editing.md` draft (how to sign in, edit text, add/remove gallery photos, wait for deploy, what not to touch). Phase 5 finalizes it.
6. Update status doc (auth URL, secret name, OAuth App owner, any schema-validation quirks, `./` path decision).

Deliverables:

- [ ] Tyler can sign in at `/admin/` with GitHub and complete one text edit and one image upload that go live automatically.
- [ ] Auth Lambda rejects unknown `site_id` domains and bad state (tests pass).
- [ ] `pnpm check` validates the CMS config against the schema.

### Phase 3.5 — Photo quality pass

**Goal**: The gallery images are as good as they are ever going to get, so that
Phase 4's redesign is judged against final assets rather than placeholders.
Added 2026-09-06; see §2.6 for the measurements behind it.

Sequenced here because the CMS works by now (so replacing an image is easy
either way) and because Phase 4's screenshots, Lighthouse run and design
decisions are only meaningful against the real photos.

Manual step for Tyler — **start this during Phase 2, not here**: ask whoever
travelled to Haiti (Joy Richards, Jeanette Juetten) whether the original camera
files or original email attachments still exist for the Galette Chambon
orphanage and health-centre photos. This has human lead time and is worth more
than any amount of upscaling.

Kickoff prompt:

```
Read docs/migration-plan.md (especially §2.6) and docs/migration-status.md. Execute Phase 3.5 as written. Work on branch `sveltia`. Do the upscaling locally, compare before/after at 100% yourself before committing anything, and stop and ask me about any image where a face changes. Commit and push, then update docs/migration-status.md.
```

Steps:

1. Take stock: re-run the measurement in §2.6 against the current content (it
   may have changed if originals turned up). Any photo for which an original
   was recovered is simply dropped in — no upscaling, and it leaves Group A/B
   entirely.
2. Install Upscayl (`brew install --cask upscayl`). Trial on **three** images
   spanning the range — one Group A (`gs1.jpg`, clean 858px), one Group B
   (`galette-chambon-orphanage-5.jpg`, the worst at 0.07 B/px) and one portrait
   with faces (`pc1.jpg`). Try a faithful 2× model, and for Group B a
   de-artifact pass first. Save the comparisons to the scratchpad.
3. Show Tyler the three before/after pairs and get a go/no-go on the model
   choice before batching. Do not batch on your own judgment — the acceptance
   test in §2.6 is subjective by design.
4. Batch the approved set at 2×. Overwrite in place under `src/content/**`,
   same filenames. Do not touch captions, frontmatter or components.
5. Verify: `pnpm build` succeeds; every gallery still has its original count
   (4/8/2/4/5/10/2/0); no image got _smaller_; spot-check several in the
   lightbox at 100% on a retina screen. Compare total `dist/` size and the
   page's transferred weight before and after — bigger sources must not blow up
   the page budget, since Astro serves the responsive variants either way.
6. Once sources support it, widen the gallery's full-size `widths` (§2.4 uses
   `[800, 1200, 1600]`) to include 2400, and re-check page weight.
7. Record in the status doc: which tool and model, which images were replaced,
   which were left alone and why, and the before/after size totals.

Deliverables:

- [ ] Tyler has seen and approved the before/after samples.
- [ ] Gallery images are 2× larger where it helped, unchanged where it did not,
      and no face looks like a different person.
- [ ] `pnpm build` green; gallery counts unchanged; page weight still sane.

### Phase 4 — UI redesign: layout, nav, gallery, palette, a11y

**Goal**: Modern look and feel per §2.4 with identical structure and copy; excellent mobile nav; polished gallery/lightbox; accessible.

Kickoff prompt:

```
Read docs/migration-plan.md (especially §2.4) and docs/migration-status.md. Execute Phase 4 as written. Work on branch `sveltia`. Delegate component work to sonnet sub-agents in parallel, then review the result yourself with Playwright screenshots at 375px, 768px and 1280px on the live test domain, run axe, fix issues, commit and push often, and finish by updating docs/migration-status.md.
```

Steps:

1. Font Awesome (§2.5): add `@fortawesome/pro-solid-svg-icons` (and/or `pro-regular`/`pro-light` — pick the weight that suits the design) and `@fortawesome/free-brands-svg-icons`, write `src/components/Icon.astro`, and use it for PayPal, Venmo, GitHub, the Word document link, the hamburger, the lightbox close and chevrons, and external links. Deleting the hand-pasted inline Venmo SVG from `Donate.astro` is the check that this landed. `.npmrc` and the CI secret already exist from Phase 2; confirm the first CI build after adding the packages is green before building on top of it, and confirm in the built output that only the imported icons shipped.
2. Design tokens and base (`global.css` `@theme`, fonts, prose styles for richtext output, focus-visible rings, reduced-motion). Use the `frontend-design` skill for direction if available; keep it restrained and warm, not templated.
3. Components, in parallel sub-agents with fixed contracts:
   - `Nav`: sticky, `brand-dark`, org name/wordmark left, links (Events, Our Mission, Our Impact, Contact) + accent Donate button right; mobile hamburger disclosure (`<button aria-expanded aria-controls>`, `hidden` toggling, Esc closes and focuses the button, closes on link click), smooth scroll with `scroll-margin-top` on section headings, current-section highlighting optional.
   - `Hero`/intro, `Events` (two-column, image right), `Mission`, `Projects` + `ProjectGallery` (responsive thumbnail grid, captions on hover/under, each thumb a `<button>` with the caption as accessible name), `Lightbox` (`<dialog>`: loads full `src`/`srcset`/`sizes` only on open, caption, prev/next buttons, arrow keys, swipe via pointer events, close button, backdrop click, focus restore, `aria-label`s; prefetch neighbors after open), `Contacts` (cards + board photo with caption), `Donate` (three cards; PayPal, Venmo icon inline SVG, Mail address block), `Footer`.
4. Responsiveness: mobile-first; no horizontal scroll at 320px; images use `sizes` that match layout widths; hero uses `loading="eager"` + `fetchpriority="high"`, everything else lazy.
5. Accessibility: run axe (Playwright + `@axe-core/playwright` as a dev script, not a test suite) with zero serious/critical violations; keyboard-only walkthrough of nav, gallery, lightbox; heading order h1→h2→h3; alt text from captions; color contrast per §2.4; `prefers-reduced-motion` respected.
6. Performance sanity: Lighthouse (via Playwright/Chrome or `npx lighthouse`) on the live test domain ≥ 90 on all four categories on mobile; page weight of the initial load well under 1 MB.
7. Update status doc with the final token values, any deviations from §2.4 and why, and screenshots' paths (save them under the scratchpad, not the repo).

Deliverables:

- [ ] Tyler is happy with the look on phone and desktop; the hamburger menu works; the gallery lightbox works with touch and keyboard.
- [ ] axe: no serious/critical issues. Lighthouse mobile ≥ 90 across the board.

### Phase 5 — SEO, canary, docs

**Goal**: Search/social metadata, sitemap and robots; a daily canary that emails Tyler on failure; editor documentation; CLAUDE.md final for the new stack.

Manual step for Tyler: confirm the SNS subscription email ("AWS Notification - Subscription Confirmation") when it arrives.

Kickoff prompt:

```
Read docs/migration-plan.md and docs/migration-status.md. Execute Phase 5 as written. Work on branch `sveltia`, delegate to sonnet sub-agents, verify on the live test domain (including forcing the canary to fail once and confirming the alarm fires), commit and push often, and finish by updating docs/migration-status.md and CLAUDE.md.
```

Steps:

1. SEO (sub-agent, `packages/app`): `Seo.astro` (title, description from `site.description`, canonical from `Astro.site` + path, OG type/title/description/url/image with width/height, Twitter summary_large_image, `theme-color`), generated 1200×630 OG image from `site.og_image` via `getImage({ width: 1200, height: 630, fit: 'cover', format: 'jpg' })`, `JsonLd.astro` with schema.org `NGO` (name, url, logo, email of president, address city/state, `nonprofitStatus` optional), `<html lang="en">`, favicon set (`favicon.svg` + `.ico` + apple-touch-icon; derive a simple mark if none exists), `@astrojs/sitemap` (exclude `/admin/**` and `/404`), `robots.txt` with `Sitemap:` and `Disallow: /admin/`, `concert.html` keeps its own OG tags from `events.share`. Validate with a fetch of the live HTML and an OG debugger-style check of the tags (no external submission needed).
2. Canary (sub-agent, `packages/cdk`): `aws-synthetics` `Canary` in `SiteStack` (name `hrs-<stage>-daily`, `Runtime.SYNTHETICS_NODEJS_PLAYWRIGHT_2_0` or the newest Playwright runtime available, `Schedule.cron({ minute: '0', hour: '13' })` (08:00 Central-ish; `rate()` cannot express one day), `artifactsBucketLifecycleRules` 30 days, script `packages/cdk/canary/index.js` that loads `https://<stage domain>/`, asserts HTTP 200 and that the `h1` contains "Haitian Relief Services" and that at least one project gallery image exists). Alarm on `metricSuccessPercent()` `< 100`, 1 period of 1 day, `treatMissingData: BREACHING`, actions to an SNS topic with `EmailSubscription('tylerschloesser@gmail.com')` (both alarm and OK actions so recovery is emailed too). Deploy to the sveltia stage first; run the canary manually once (`aws synthetics start-canary`), then break it deliberately (e.g. point at a bad URL via a temporary env change) to confirm the email arrives; restore.
3. Docs: finalize `docs/editing.md` for editors (screenshots optional), rewrite `CLAUDE.md` (stack, commands, content model, deploy, canary, CMS auth, conventions), add `README.md` at root with the same essentials. Remove `docs/migration-prompt.md`? No: keep both migration docs for history.
4. Status doc update: what the canary checks, how to change the alert email, how to re-point the OAuth callback if the Function URL ever changes.

Deliverables:

- [ ] `view-source` of the test domain shows complete meta/OG/JSON-LD; `/sitemap-index.xml` and `/robots.txt` correct.
- [ ] Canary exists, ran green, and Tyler received the forced-failure email and the OK email.
- [ ] `docs/editing.md`, `CLAUDE.md`, `README.md` are accurate.

### Phase 6 — Cutover and cleanup

**Goal**: haitianrelief.org serves the new site from `main`; old site preserved on branch `semantic-ui`; test stack, staging stack, and temporary branches removed.

Kickoff prompt:

```
Read docs/migration-plan.md and docs/migration-status.md. Execute Phase 6 as written, carefully and in order. Confirm each verification step against the live site before moving to the next. Finish by updating docs/migration-status.md with the final state and cleanup log.
```

Steps (in order; the orchestrator does these itself, sub-agents only for small edits):

1. Pre-flight on `sveltia`: `pnpm check` green, last Actions run green, test domain healthy, `docs/migration-status.md` up to date. Confirm `git status` clean.
2. Backup: `git branch semantic-ui main && git push -u origin semantic-ui`. Verify on GitHub.
3. Prod stack readiness: `STAGE=prod` synth locally (`cdk diff OrgHaitianReliefProd`) and review: the prod bucket, distribution and zone are updated in place; expect new CloudFront Function, response headers policy, second `BucketDeployment`, canary, SNS topic; `defaultRootObject` changes to `index.html`. Nothing should be replaced destructively (the bucket keeps its name; the distribution keeps its domain). If the diff shows a replacement of the distribution or bucket, stop and fix before merging.
4. Merge: `git checkout main && git merge --no-ff sveltia -m "migrate to astro and sveltia cms"` (no squash; keep history) and push. The new workflow on `main` deploys prod with `CMS_BRANCH=main`, `SITE_URL=https://haitianrelief.org`. Watch the run. Also add `automatic_deployments`-style notes if any CMS setting should differ on prod (none expected).
5. Verify prod with Playwright and curl: https://haitianrelief.org and https://prod.haitianrelief.org load the new site; `/admin/` signs in and shows `branch: main` content; `/concert.html` redirect; cache headers; sitemap; robots; canary for prod exists; the prod SNS subscription is confirmed by Tyler (new topic → new confirmation email).
6. CMS check on prod: Tyler makes one real edit at https://haitianrelief.org/admin/ and sees it live.
7. Cleanup (only after 5 and 6 pass):
   - `AWS_PROFILE=admin STAGE=sveltia cdk destroy OrgHaitianReliefSveltia` (bucket auto-empties; CloudFront disable takes ~15 minutes). Confirm the `sveltia` NS record is gone from the apex zone.
   - `cdk destroy OrgHaitianReliefStaging` using the **old** code if needed (`git worktree add ../hrs-old semantic-ui`), or delete via CloudFormation directly after emptying `org.haitianrelief.staging`. This also deletes the old role `hrs-github-actions-deploy`. Confirm the `staging` NS record is gone.
   - Remove `refs/heads/sveltia` from the deploy role trust and `sveltia.haitianrelief.org` from `ALLOWED_DOMAINS`; push (deploys via `main`).
   - Delete branch `sveltia` locally and on GitHub; delete the stale `dependabot/*` and `static` remote branches and the local `v3` branch (all superseded). Keep `semantic-ui`.
   - Update the GitHub OAuth App homepage/description if it mentions the test domain (callback stays the same).
   - Delete the repo secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` (created 2021-06-26). They are long-lived static AWS keys on a public repo, superseded by OIDC and unused by the new workflow. Deactivate the underlying IAM access key in the account too, not just the secret.
   - Final `docs/migration-status.md`: "migration complete" with a resource inventory (stacks, role, secret, OAuth App, canary, SNS topic) and the cleanup log. Update `CLAUDE.md` to drop any migration-era notes.

Deliverables:

- [ ] https://haitianrelief.org is the new site; editing at `/admin/` works on `main`.
- [ ] Branch `semantic-ui` on GitHub holds the old site. Branch `sveltia` and the sveltia/staging stacks are gone.
- [ ] Only `OrgHaitianReliefShared`, `OrgHaitianReliefProd` and `CDKToolkit` remain for this site.

## 4. Verification toolbox (for every phase)

- Build gates: `pnpm check` (prettier, `astro check`, `tsc -b packages/cdk`, CMS config schema validation from Phase 3).
- Local preview: `pnpm --filter app dev` (Astro dev) or `pnpm build && pnpm --filter app preview`.
- Browser: the `playwright-cli` skill (`playwright-cli open <url>`, `snapshot`, `screenshot`, `resize 375 812`) or the Playwright MCP tools. Save screenshots under the session scratchpad, never in the repo.
- Accessibility: a dev-only script `packages/app/scripts/axe.mjs` (Playwright + `@axe-core/playwright`) run against a URL. Not part of CI.
- Deploy status: `gh run list --branch sveltia --limit 3`, `gh run watch`.
- AWS: `AWS_PROFILE=admin aws cloudformation describe-stacks --stack-name <name>`; `aws synthetics get-canary-runs --name <name>`.
- Sveltia local dev: the CMS at `http://localhost:4321/admin/` can use "Work with local repository" (Chrome, File System Access API) against the checked-out repo without any auth, which is the fastest way to test config changes before pushing.

## 5. Risks and mitigations

- **Sveltia is pre-1.0 and releases several times a week.** Pin the exact `@sveltia/cms` version in `admin/index.html`; bump deliberately. The JSON schema validation in `pnpm check` catches config drift when bumping.
- **Entry-relative image paths vs Astro `image()`.** Spiked first thing in Phase 1; a Zod transform is the fallback.
- **OAuth App has one callback URL.** The Function URL is stable per Lambda; never rename/recreate the auth function's construct id without updating the OAuth App.
- **Public repo, admin emails already public.** Nothing new is exposed. Never commit the client secret; it lives only in Secrets Manager.
- **Every CMS save deploys (~5 min).** Acceptable for this site. If it becomes noisy, Sveltia's editorial workflow (`publish_mode: editorial_workflow`, PR-based) can be enabled later without code changes.
- **Prod stack updated in place at cutover.** `cdk diff` review in Phase 6 step 3 is mandatory; the `semantic-ui` branch plus the old stack code can redeploy the old site if needed.
- **Font Awesome makes a public repo unbuildable without a licence.** Accepted (§2.5). If it ever matters, the escape hatch is the `@fortawesome/free-*` packages plus deleting `.npmrc` — the `<Icon>` component itself does not change.
- **The Font Awesome token is a credential in CI on a public repo.** It reaches the runner only as a secret, never as a repo variable and never in `.npmrc`. Pull requests from forks must not be given it.
- **Upscaling can quietly falsify a photograph.** Faithful models only, and Tyler approves samples before any batch (§2.6). If in doubt, keep the original.
- **CloudFront propagation and cert validation are slow** (10–20 minutes). Sessions should use `gh run watch` and background waits rather than assuming failure.

## 6. Open items Tyler may want to decide (defaults chosen)

- Donate accent: amber (default) vs Haitian flag red (§2.4).
- Whether editors should be able to add new projects (default: yes, `create: true`) and delete them (default: no, `delete: false`).
- Alert email: `tylerschloesser@gmail.com` (default).
- Keep unused legacy photos in CMS media (default: yes, they cost nothing and editors may want them).
- Font Awesome weight for the redesign: `pro-solid` vs `pro-regular` vs `pro-light` (§2.5; default: decided in Phase 4 against the actual design).
- Whether making the repo unbuildable without a Font Awesome Pro token is acceptable (§2.5; default: yes).
- Photo upscaling tool and model (§2.6; default: Upscayl at 2×, free — with Tyler approving the samples before the batch).
