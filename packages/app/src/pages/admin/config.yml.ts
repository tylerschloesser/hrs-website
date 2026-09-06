export const prerender = true

const branch = process.env.CMS_BRANCH ?? 'main'
const authUrl = process.env.CMS_AUTH_URL ?? ''
const siteUrl = process.env.SITE_URL ?? 'https://haitianrelief.org'

const richtext = (indent: string) =>
  `${indent}widget: richtext
${indent}modes: [rich_text, raw]
${indent}buttons: [bold, italic, link, bulleted-list, heading-three]`

const body = `# yaml-language-server: $schema=https://unpkg.com/@sveltia/cms/schema/sveltia-cms.json
backend:
  name: github
  repo: tylerschloesser/hrs-website
  branch: ${branch}
${authUrl ? `  base_url: ${authUrl}\n` : ''}  auth_methods: [oauth, token]
site_url: ${siteUrl}
display_url: ${siteUrl}
logo_url: /favicon.ico
media_folder: packages/app/src/content/media
public_folder: /packages/app/src/content/media
media_libraries:
  default:
    config:
      transformations:
        raster_image:
          format: webp
          quality: 85
          width: 2048
          height: 2048

singletons:
  - name: site
    label: Site settings
    file: packages/app/src/content/site.yml
    fields:
      - { label: Name, name: name, widget: string }
      - { label: Tagline, name: tagline, widget: string }
      - label: Description
        name: description
        widget: text
        hint: Used as the default meta description when a page doesn't set its own.
      - label: Social share image
        name: og_image
        widget: image
        media_folder: /packages/app/src/content/media
        public_folder: media
      - label: Donate
        name: donate
        widget: object
        fields:
          - { label: PayPal URL, name: paypal_url, widget: string }
          - { label: Venmo URL, name: venmo_url, widget: string }
          - label: Mail-in donations
            name: mail
            widget: object
            fields:
              - { label: Attn, name: attn, widget: string }
              - { label: Street address, name: street, widget: string }
              - { label: 'City, state, ZIP', name: city_state_zip, widget: string }
      - { label: GitHub URL, name: github_url, widget: string }
      - label: Google Tag Manager ID
        name: gtm_id
        widget: string
        hint: 'e.g. GTM-XXXXXXX'

  - name: home
    label: Home page
    file: packages/app/src/content/home.yml
    fields:
      - label: Intro
        name: intro
${richtext('        ')}
      - label: Hero image
        name: hero_image
        widget: image
        media_folder: /packages/app/src/content/media
        public_folder: media
      - label: Hero image alt text
        name: hero_alt
        widget: string
        hint: Describe the image for screen readers.
      - label: Mission
        name: mission
${richtext('        ')}
      - { label: Why heading, name: why_heading, widget: string }
      - label: Why section body
        name: why
${richtext('        ')}

  - name: events
    label: Events
    file: packages/app/src/content/events.yml
    fields:
      - { label: Heading, name: heading, widget: string }
      - label: Body
        name: body
${richtext('        ')}
      - label: Image
        name: image
        widget: image
        media_folder: /packages/app/src/content/media
        public_folder: media
      - label: Image alt text
        name: image_alt
        widget: string
        hint: Describe the image for screen readers.
      - label: Videos
        name: videos
        widget: list
        fields:
          - { label: Label, name: label, widget: string }
          - { label: URL, name: url, widget: string }
      - { label: Closing, name: closing, widget: string }
      - label: Share preview
        name: share
        widget: object
        hint: Used when this page is shared on social media (e.g. Facebook, Twitter).
        fields:
          - { label: Title, name: title, widget: string }
          - { label: Description, name: description, widget: string }
          - label: Image
            name: image
            widget: image
            media_folder: /packages/app/src/content/media
            public_folder: media
          - label: Redirect to
            name: redirect_to
            widget: string
            hint: Path visitors land on after the share preview loads (e.g. /events).

  - name: contacts
    label: Contacts
    file: packages/app/src/content/contacts.yml
    fields:
      - label: Members
        name: members
        widget: list
        fields:
          - { label: Name, name: name, widget: string }
          - { label: Role, name: role, widget: string }
          - { label: Email, name: email, widget: string }
      - label: Photo
        name: photo
        widget: image
        media_folder: /packages/app/src/content/media
        public_folder: media
      - { label: Photo caption, name: photo_caption, widget: string }

collections:
  - name: projects
    label: Projects
    folder: packages/app/src/content/projects
    path: '{{slug}}/index'
    media_folder: images
    public_folder: images
    create: true
    delete: false
    sortable_fields: [order, title]
    fields:
      - { label: Title, name: title, widget: string }
      - label: Order
        name: order
        widget: number
        hint: Controls display order on the projects page; lower numbers appear first.
      - label: Gallery
        name: gallery
        widget: list
        thumbnail: image
        fields:
          - { label: Image, name: image, widget: image }
          - { label: Caption, name: caption, widget: string }
      - label: Attachments
        name: attachments
        widget: list
        required: false
        fields:
          - { label: Label, name: label, widget: string }
          - label: File
            name: file
            widget: file
            media_folder: /packages/app/public/documents
            public_folder: /documents
            hint: A PDF or Word document offered as a download.
      - label: Body
        name: body
${richtext('        ')}
`

export const GET = () =>
  new Response(body, {
    headers: { 'Content-Type': 'text/yaml; charset=utf-8' },
  })
