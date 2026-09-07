/**
 * Dev-only: capture full-page screenshots of a URL at the three review
 * widths, plus the mobile nav and the lightbox in their open states.
 *
 *   node scripts/shots.mjs <url> <outDir> [label]
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const url = process.argv[2] ?? 'http://localhost:4321/'
const outDir = process.argv[3] ?? './shots'
const label = process.argv[4] ?? 'page'

const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1280', width: 1280, height: 900 },
]

await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(400)

  await page.screenshot({
    path: `${outDir}/${label}-${vp.name}-full.png`,
    fullPage: true,
  })

  // Horizontal overflow check at this width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )

  const toggle = page.locator('#nav-toggle')
  if (await toggle.isVisible()) {
    await toggle.click()
    await page.locator('#nav-panel').waitFor({ state: 'visible' })
    await page.screenshot({ path: `${outDir}/${label}-${vp.name}-nav.png` })
    await page.keyboard.press('Escape')
  }

  const thumb = page.locator('.gallery button[data-full-src]').nth(1)
  if ((await thumb.count()) > 0) {
    await thumb.scrollIntoViewIfNeeded()
    await thumb.click()
    await page.locator('#lightbox').waitFor({ state: 'visible' })
    await page.waitForTimeout(900)
    await page.screenshot({
      path: `${outDir}/${label}-${vp.name}-lightbox.png`,
    })
    await page.keyboard.press('Escape')
  }

  console.log(
    `${vp.name}px: overflow=${overflow}px consoleErrors=${errors.length}` +
      (errors.length ? ` :: ${errors.join(' | ')}` : '')
  )
  await context.close()
}

// A 320px overflow check, the narrowest width the plan calls out.
const narrow = await browser.newContext({
  viewport: { width: 320, height: 720 },
})
const narrowPage = await narrow.newPage()
await narrowPage.goto(url, { waitUntil: 'load' })
const overflow320 = await narrowPage.evaluate(
  () => document.documentElement.scrollWidth - window.innerWidth
)
await narrowPage.screenshot({
  path: `${outDir}/${label}-320-full.png`,
  fullPage: true,
})
console.log(`320px: overflow=${overflow320}px`)
await narrow.close()

await browser.close()
