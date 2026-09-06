/**
 * The Sveltia CMS config and the Astro content schema describe the same files.
 * If they drift, an editor's save writes a document Astro can no longer build,
 * and the site breaks minutes later with nothing to point at. This compares the
 * two field-by-field so the drift is caught by `pnpm check` instead.
 *
 * Full JSON-schema validation of the CMS config is a separate concern; this is
 * only about parity with `src/content.config.ts`.
 */
import assert from 'node:assert'
import { parse } from 'yaml'
import { GET } from '../src/pages/admin/config.yml.ts'

/** Field paths the Astro schema requires, per CMS file. Keep in sync by hand. */
const EXPECTED = {
  site: [
    'name',
    'tagline',
    'description',
    'og_image',
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

const config = parse(await (await GET({})).text())
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
