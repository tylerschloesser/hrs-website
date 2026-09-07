// Generated at build time rather than kept as a static public/ file so the
// Sitemap: line always points at whatever `site` the build was given.
import type { APIRoute } from 'astro'

export const prerender = true

export const GET: APIRoute = ({ site }) => {
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
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
