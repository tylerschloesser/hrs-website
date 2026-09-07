// Generated at build time (rather than a static public/ file) so that
// non-production stages (e.g. sveltia.haitianrelief.org) ship a
// Disallow: / robots.txt instead of inviting search engines to index a
// duplicate of the production site.
import type { APIRoute } from 'astro'

export const prerender = true

export const GET: APIRoute = ({ site }) => {
  // An unset STAGE means a plain local `pnpm build`, which should keep
  // producing the production robots.txt.
  const stage = process.env.STAGE ?? 'prod'
  const isProd = stage === 'prod'

  const body = isProd
    ? [
        'User-agent: *',
        'Allow: /',
        'Disallow: /admin/',
        '',
        `Sitemap: ${
          new URL(
            '/sitemap-index.xml',
            site ?? process.env.SITE_URL ?? 'https://haitianrelief.org'
          ).href
        }`,
        '',
      ].join('\n')
    : [
        '# Non-production copy of haitianrelief.org — keep it out of search results.',
        'User-agent: *',
        'Disallow: /',
        '',
      ].join('\n')

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
