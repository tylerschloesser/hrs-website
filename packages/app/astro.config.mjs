// @ts-check
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL ?? 'https://haitianrelief.org',
  build: {
    // Emit `about.html` instead of `about/index.html` so `/concert.html`
    // keeps working and S3 keys stay obvious.
    format: 'file',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
})
