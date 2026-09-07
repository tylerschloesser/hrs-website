/**
 * The Sveltia CMS config and the Astro content schema describe the same files.
 * If they drift, an editor's save writes a document Astro can no longer build,
 * and the site breaks minutes later with nothing to point at. This compares
 * the CMS config's field names against `EXPECTED` below, a hand-maintained
 * list of the paths `content.config.ts` requires (plus `body`, the markdown
 * body that never appears in the Zod schema at all) — not a derivation from
 * the Zod schema itself, so the two lists can still drift from each other and
 * this won't notice. Keep `EXPECTED` in sync by hand whenever the schema
 * changes.
 *
 * Before that, a separate check validates the generated config against the
 * official Sveltia CMS JSON schema. That's the guard against a typo'd option
 * name (Sveltia ignores options it doesn't recognise, so a typo fails
 * invisibly at runtime instead of at `pnpm check`) or a value of the wrong
 * shape. The schema ships inside the `@sveltia/cms` package itself, pinned to
 * the exact version `public/admin/index.html` loads, so this doesn't depend on
 * unpkg being reachable or up to date when CI runs.
 *
 * One thing it deliberately cannot catch: a misspelled `widget`. The schema
 * accepts any unknown widget name as a custom field type, because Sveltia lets
 * you register your own. Widget names have to be checked by hand against the
 * docs.
 */
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { parse } from 'yaml'
import { GET } from '../src/pages/admin/config.yml.ts'

/**
 * `@sveltia/cms`'s package.json only exports its bundle ("."), so the schema
 * file can't be resolved as a subpath import (Node's exports map rejects any
 * path that isn't listed). Resolve the bundle instead and walk up to the
 * package root — that also avoids hard-coding `node_modules/`, since pnpm's
 * store layout isn't flat.
 */
const bundlePath = fileURLToPath(import.meta.resolve('@sveltia/cms'))
const packageRoot = path.dirname(path.dirname(bundlePath))
const schemaPath = path.join(packageRoot, 'schema', 'sveltia-cms.json')
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'))

const draft = schema.$schema ?? ''
const AjvClass = draft.includes('2020-12') ? Ajv2020 : Ajv
if (!draft.includes('2020-12') && !draft.includes('draft-07')) {
  throw new Error(
    `@sveltia/cms's schema declares an unexpected $schema (${draft}); ` +
      'pick the matching Ajv export before trusting this check.'
  )
}
const ajv = new AjvClass({ allErrors: true, strict: false })
addFormats(ajv)
const validateSchema = ajv.compile(schema)

const config = parse(await (await GET({})).text())

if (!validateSchema(config)) {
  console.error('cms config fails schema validation:')
  for (const { instancePath, message } of validateSchema.errors) {
    console.error(`  ${instancePath || '(root)'}: ${message}`)
  }
  process.exit(1)
}
console.log('cms config matches the sveltia-cms schema')

/**
 * Field paths expected in the CMS config, per CMS file, hand-copied from
 * `content.config.ts` (plus `body`, which isn't in the Zod schema — it's the
 * markdown body). Keep in sync by hand; nothing derives this from the schema.
 */
const EXPECTED = {
  site: [
    'name',
    'tagline',
    'description',
    'og_image',
    'og_image_alt',
    'donate',
    'donate.paypal_url',
    'donate.venmo_url',
    'donate.mail',
    'donate.mail.attn',
    'donate.mail.street',
    'donate.mail.city_state_zip',
    'github_url',
    'gtm_id',
  ],
  home: ['intro', 'hero_image', 'hero_alt', 'mission', 'why_heading', 'why'],
  events: [
    'heading',
    'body',
    'image',
    'image_alt',
    'videos',
    'videos.label',
    'videos.url',
    'closing',
    'share',
    'share.title',
    'share.description',
    'share.image',
    'share.redirect_to',
  ],
  contacts: [
    'members',
    'members.name',
    'members.role',
    'members.email',
    'photo',
    'photo_caption',
  ],
  projects: [
    'title',
    'order',
    'gallery',
    'gallery.image',
    'gallery.caption',
    'attachments',
    'attachments.label',
    'attachments.file',
    'body',
  ],
}

/** Flatten a CMS field list into dotted paths, descending into object/list fields. */
function paths(fields, prefix = '') {
  return fields.flatMap((field) => {
    const path = prefix + field.name
    return field.fields ? [path, ...paths(field.fields, `${path}.`)] : [path]
  })
}

const byName = Object.fromEntries(
  [...config.singletons, ...config.collections].map((it) => [it.name, it])
)

let failed = false
for (const [name, expected] of Object.entries(EXPECTED)) {
  const entry = byName[name]
  assert(entry, `CMS config has no singleton or collection named "${name}"`)
  const actual = paths(entry.fields)
  const missing = expected.filter((p) => !actual.includes(p))
  const extra = actual.filter((p) => !expected.includes(p))
  if (missing.length || extra.length) {
    failed = true
    console.error(`${name}:`)
    if (missing.length) console.error(`  missing from CMS config: ${missing}`)
    if (extra.length) console.error(`  not in the Astro schema: ${extra}`)
  }
}

if (failed) {
  console.error(
    '\nCMS config and src/content.config.ts disagree. Update both together.'
  )
  process.exit(1)
}
console.log('cms config matches the astro content schema')
