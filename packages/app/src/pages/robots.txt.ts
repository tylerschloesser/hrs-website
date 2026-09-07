// Generated at build time rather than kept as a static public/ file so the
// Sitemap: line always points at whatever `site` the build was given.
//
// This used to branch on STAGE to ship `Disallow: /` for the non-production
// stages. There are no stages any more - one domain, one build - so there is
// only the production robots.txt. A future test environment would be a
// separate app with its own domain, and would need its own `Disallow: /`.
import type { APIRoute } from 'astro'

export const prerender = true

export const GET: APIRoute = ({ site }) => {
  const body = [
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

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
