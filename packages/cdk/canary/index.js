// Daily canary for the live site (Phase 5 step 2 of docs/migration-plan.md).
//
// This file is zipped by `Code.fromAsset(<this directory>)` and run inside
// the CloudWatch Synthetics Lambda runtime, which is CommonJS - it is never
// loaded by local Node, so `packages/cdk`'s `"type": "module"` in
// package.json does not apply here. Do not convert this to `import`/`export`.
//
// Runtime: syn-nodejs-playwright-6.0. The package name below
// (`@aws/synthetics-playwright`) was confirmed against the current AWS docs
// ("Writing a Node.js canary script using the Playwright runtime" and
// "Library functions available for Node.js canary scripts using
// Playwright") - some older/translated pages say `@amzn/synthetics-playwright`,
// which is stale. `synthetics.newPage(browser)` is the documented function on
// the "Library functions" reference page; the separate "Sample code" page
// uses `synthetics.getPage(browser)` for the same thing, which is either an
// alias or a doc inconsistency - `newPage` is what the authoritative
// per-runtime API reference documents, so that's what's used here.
const { synthetics } = require('@aws/synthetics-playwright')

const NAV_TIMEOUT_MS = 30000

exports.handler = async () => {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) {
    // Loud and specific: a silent no-op canary would report "success"
    // forever while checking nothing.
    throw new Error('SITE_URL environment variable is not set')
  }

  const browser = await synthetics.launch()

  try {
    const page = await synthetics.newPage(browser)

    await synthetics.executeStep('navigate', async () => {
      const response = await page.goto(siteUrl, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT_MS,
      })

      if (!response) {
        throw new Error(`No response navigating to ${siteUrl}`)
      }

      const status = response.status()
      if (status !== 200) {
        throw new Error(`Expected HTTP 200 loading ${siteUrl}, got ${status}`)
      }
    })

    await synthetics.executeStep('verify-heading', async () => {
      const h1Count = await page.locator('h1').count()
      if (h1Count === 0) {
        throw new Error('Expected an <h1> on the page, found none')
      }

      const h1Text = await page.locator('h1').first().innerText()
      const expected = 'Haitian Relief Services'
      if (!h1Text.includes(expected)) {
        throw new Error(
          `Expected the h1 to contain "${expected}", got "${h1Text}"`
        )
      }
    })

    await synthetics.executeStep('verify-gallery', async () => {
      const galleryImageCount = await page.locator('.gallery img').count()
      if (galleryImageCount === 0) {
        throw new Error(
          'Expected at least one ".gallery img" (a project gallery photo), found none'
        )
      }
    })

    // No explicit screenshot call: `executeStep` screenshots on start and
    // on success/failure of every step by default, and those land in the
    // canary's S3 artifacts. A `page.screenshot({ path })` of our own would
    // write into the Lambda's ephemeral /tmp and be thrown away with the
    // execution environment, which looks like diagnostics but isn't.
  } finally {
    // In a `finally` per AWS's own sample so a thrown assertion above still
    // closes the browser instead of leaking the Lambda execution environment.
    await synthetics.close()
  }
}
