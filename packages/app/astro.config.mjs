// @ts-check
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://haitianrelief.org',
  build: {
    // Emit `concert.html` instead of `concert/index.html` so it keeps
    // working and S3 keys stay obvious.
    format: 'file',
  },
  integrations: [
    sitemap({
      // `/admin` is the CMS. `/404` is the not-found page (belt-and-braces —
      // Astro doesn't route to it directly, but `filter` runs against every
      // built page, so this drops it if it were ever built as a link
      // target). `/concert.html` is a share-preview page that carries its
      // own `noindex` and immediately redirects to `/#events` — it must not
      // be indexed or advertised for crawling.
      //
      // Note: `@astrojs/sitemap` doesn't know about `build.format: 'file'`
      // and drops the `.html` extension from every URL it lists (e.g. it
      // would emit `/concert`, which 404s — the real page is
      // `/concert.html`). If a future `.html` page needs to appear in the
      // sitemap, fix that with the `serialize` option, not by assuming the
      // emitted `<loc>` is correct.
      filter: (page) =>
        !page.includes('/admin') &&
        !page.includes('/404') &&
        !page.includes('/concert'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
