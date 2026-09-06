import { marked } from 'marked'

/**
 * Render a markdown string from a CMS `richtext` field. Project descriptions
 * use Astro's own renderer (they are markdown bodies); this covers the
 * singleton fields, which are strings inside YAML.
 */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true })
}
