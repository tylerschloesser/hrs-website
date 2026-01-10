# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install dependencies**: `bun install` (use bun, not npm)
- **Build**: `bun run build` (builds the app package)
- **Type check**: `bun tsc -b` (project uses references, so `--noEmit` doesn't work)
- **Lint/Format check**: `bun run test` (runs prettier --check)
- **Dev server**: `bun run start -w packages/app` (runs webpack-dev-server)
- **Deploy**: `STAGE=staging bun run deploy` or `STAGE=prod bun run deploy`

## Architecture

This is a static website for haitianrelief.org, organized as an npm/bun workspace monorepo.

### Packages

- **packages/app**: Static website built with Webpack and Handlebars templates
  - `index.handlebars`: Main template
  - `index.json`: Template data/content
  - `index.js`: Client-side JavaScript (jQuery, Semantic UI modals)
  - `public/`: Static assets (images, CSS)

- **packages/cdk**: AWS CDK infrastructure (TypeScript)
  - Deploys to S3 + CloudFront
  - Uses `STAGE` env var (`staging` or `prod`) to determine domain
  - Staging: staging.haitianrelief.org
  - Prod: prod.haitianrelief.org + haitianrelief.org

- **packages/cypress-tests**: E2E tests run against staging before prod deploy

### CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`):
1. Runs prettier check
2. Builds app
3. Deploys to staging
4. Runs Cypress tests against staging
5. Deploys to prod

Pre-push hook runs `npm test` (prettier check).

## Commit Conventions

- All lowercase
- Short imperative style (e.g., "add events", "fix prettier", "update deps")
- No conventional commit prefixes (no "feat:", "fix:", etc.)
