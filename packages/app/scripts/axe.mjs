/**
 * Dev-only accessibility check. Not part of `pnpm check` or CI — Phase 4 of
 * the migration runs it by hand against a preview build or the live test
 * domain:
 *
 *   pnpm --filter @hrs-website/app exec node scripts/axe.mjs https://sveltia.haitianrelief.org/
 *
 * Every URL is scanned at three widths, and the lightbox is opened once so
 * the `<dialog>` is audited in its open state (axe cannot see a closed one).
 * Exits non-zero if any serious or critical violation is found.
 */
import { chromium } from 'playwright'
import AxeBuilder from '@axe-core/playwright'

const BLOCKING = new Set(['serious', 'critical'])

const VIEWPORTS = [
  { name: '375px', width: 375, height: 812 },
  { name: '768px', width: 768, height: 1024 },
  { name: '1280px', width: 1280, height: 900 },
]

const baseUrl = process.argv[2] ?? 'http://localhost:4321/'
const targets = process.argv.length > 3 ? process.argv.slice(2) : [baseUrl]

/** @param {import('playwright').Page} page */
async function scan(page, label) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
    .analyze()

  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact))
  const minor = results.violations.filter((v) => !BLOCKING.has(v.impact))

  console.log(
    `\n${label}: ${results.violations.length} violation(s) ` +
      `(${blocking.length} serious/critical)`
  )
  for (const v of results.violations) {
    console.log(
      `  [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} node(s))`
    )
    for (const node of v.nodes.slice(0, 3)) {
      console.log(`      ${node.target.join(' ')}`)
      console.log(`      ${node.failureSummary?.split('\n').join(' | ')}`)
    }
  }
  return { blocking: blocking.length, minor: minor.length }
}

const browser = await chromium.launch()
let blocking = 0
let minor = 0

for (const url of targets) {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'load' })

    let counts = await scan(page, `${url} @ ${viewport.name}`)
    blocking += counts.blocking
    minor += counts.minor

    // The mobile nav panel is `hidden` until opened, so audit it open too.
    const toggle = page.locator('#nav-toggle')
    if (await toggle.isVisible()) {
      await toggle.click()
      await page.locator('#nav-panel').waitFor({ state: 'visible' })
      counts = await scan(page, `${url} @ ${viewport.name} (nav open)`)
      blocking += counts.blocking
      minor += counts.minor
      await page.keyboard.press('Escape')
    }

    // Same for the lightbox: axe cannot audit a closed `<dialog>`.
    const thumb = page.locator('.gallery button[data-full-src]').first()
    if ((await thumb.count()) > 0) {
      await thumb.click()
      await page.locator('#lightbox').waitFor({ state: 'visible' })
      counts = await scan(page, `${url} @ ${viewport.name} (lightbox open)`)
      blocking += counts.blocking
      minor += counts.minor
    }

    await context.close()
  }
}

await browser.close()

console.log(
  `\n=== total: ${blocking} serious/critical, ${minor} moderate/minor ===`
)
process.exit(blocking > 0 ? 1 : 0)
