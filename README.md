# haitianrelief.org

The website for [Haitian Relief Services](https://haitianrelief.org), an
all-volunteer 501(c)(3) nonprofit. It's an [Astro](https://astro.build) build
deployed to S3 + CloudFront, edited by board members with no coding background
through [Sveltia CMS](https://github.com/sveltia/sveltia-cms) at `/admin/`, all
in a pnpm workspace.

## Quick start

Package manager is **pnpm** (see `packageManager` in `package.json`); npm will
not work.

```sh
pnpm install
pnpm dev       # Astro dev server, http://localhost:4321
pnpm build     # → packages/app/dist
pnpm preview   # serve the build locally
pnpm check     # prettier, astro check, CMS config validation, tsc, unit tests
pnpm format    # prettier --write .
```

## Layout

Two packages: `packages/app` is the Astro site, `packages/cdk` is the AWS
infrastructure that serves it. Inside the app:

- `src/content/` — the site's content (singletons and projects), editable
  through the CMS.
- `src/content.config.ts` — the content schema. It's the contract between
  Astro and the CMS: the Sveltia config in `src/pages/admin/config.yml.ts`
  must define exactly the same fields, or an editor's save can break the
  build.
- `src/components/` — Astro components.
- `src/pages/` — routes, including `admin/` (the CMS config endpoint) and the
  generated `robots.txt`.
- `public/` — only truly static files (favicon, downloadable documents, the
  pinned Sveltia CMS loader). Anything that should be image-optimized belongs
  in `src/content/`, not here.

## Deploying

Pushing to `main` deploys production via GitHub Actions, authenticated with
OIDC (no long-lived AWS keys). `pnpm check` and `pnpm build` gate the deploy.
Because a CMS save is a commit, an editor clicking **Save** in the CMS is what
triggers a production deploy — there's no separate publish step.

## Font Awesome

This repo depends on `@fortawesome/pro-solid-svg-icons`, which requires a Font
Awesome **Pro** licence token to install. Without one, `pnpm install` fails.
The root `.npmrc` maps `@fortawesome` to Font Awesome's own registry and
carries **no credential** — the token lives in `~/.npmrc` locally and in the
`FONTAWESOME_PACKAGE_TOKEN` repo secret in CI. This is a deliberate trade-off:
it makes a public repo unbuildable for anyone without a Pro licence. If you're
forking this and don't have one, the escape hatch is to swap to the
`@fortawesome/free-*` packages and delete `.npmrc`.

## More

- `docs/editing.md` — the guide for board members editing content through the
  CMS.
- `CLAUDE.md` — architecture and conventions in more depth (written for
  Claude Code, but accurate for any contributor).

## Credit

The CMS auth Lambda (`packages/cdk/lambda/cms-auth`) is a port of
[`sveltia/sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth)
(MIT, Kohei Yoshino).
