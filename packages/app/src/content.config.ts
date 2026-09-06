import { glob } from 'astro/loaders'
import { defineCollection, z } from 'astro:content'

const CONTENT_DIR = './src/content'

/**
 * Each singleton is its own single-file collection rather than one `*.yml`
 * glob, so every file gets an exact schema and none of them needs a hidden
 * discriminator field that Sveltia CMS would have to write on every save.
 * Read them with `getSingleton()` from `src/lib/content.ts`.
 *
 * Image fields hold paths relative to the entry file (e.g. `media/pc2.jpg`).
 * Astro's `image()` resolves those with or without a leading `./`, which is
 * what lets Sveltia write them in its own style.
 */
function singleton<S extends z.ZodRawShape>(
  name: string,
  shape: (image: () => z.ZodType) => S
) {
  return defineCollection({
    loader: glob({ pattern: `${name}.yml`, base: CONTENT_DIR }),
    schema: ({ image }) => z.object(shape(image)),
  })
}

const site = singleton('site', (image) => ({
  name: z.string(),
  tagline: z.string(),
  description: z.string(),
  og_image: image(),
  donate: z.object({
    paypal_url: z.string().url(),
    venmo_url: z.string().url(),
    mail: z.object({
      attn: z.string(),
      street: z.string(),
      city_state_zip: z.string(),
    }),
  }),
  github_url: z.string().url(),
  gtm_id: z.string(),
}))

const home = singleton('home', (image) => ({
  intro: z.string(),
  hero_image: image(),
  hero_alt: z.string(),
  mission: z.string(),
  why_heading: z.string(),
  why: z.string(),
}))

const events = singleton('events', (image) => ({
  heading: z.string(),
  body: z.string(),
  image: image(),
  image_alt: z.string(),
  videos: z.array(z.object({ label: z.string(), url: z.string().url() })),
  closing: z.string(),
  share: z.object({
    title: z.string(),
    description: z.string(),
    image: image(),
    redirect_to: z.string(),
  }),
}))

const contacts = singleton('contacts', (image) => ({
  members: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      email: z.string().email(),
    })
  ),
  photo: image(),
  photo_caption: z.string(),
}))

/**
 * One folder per project: `projects/<slug>/index.md`, with its gallery images
 * in `projects/<slug>/images/`. The markdown body holds the description.
 */
const projects = defineCollection({
  loader: glob({ pattern: '*/index.md', base: `${CONTENT_DIR}/projects` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      order: z.number(),
      gallery: z
        .array(z.object({ image: image(), caption: z.string() }))
        .default([]),
      attachments: z
        .array(z.object({ label: z.string(), file: z.string() }))
        .default([]),
    }),
})

export const collections = { site, home, events, contacts, projects }
