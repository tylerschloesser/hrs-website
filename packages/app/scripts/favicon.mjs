/**
 * Dev-only: regenerate the raster favicon set from `public/favicon.svg`.
 * Run after editing the SVG mark:
 *
 *   pnpm --filter @hrs-website/app exec node scripts/favicon.mjs
 *
 * Writes:
 *   - public/apple-touch-icon.png  180x180, flattened onto brand-dark
 *     (iOS ignores transparency, so this can't be left alpha).
 *   - public/favicon.ico           16x16 + 32x32 + 48x48, PNG-compressed
 *     entries in a hand-built ICO container. `sharp` can only write raster
 *     image formats, not .ico, so the ICONDIR/ICONDIRENTRY headers below
 *     are assembled by hand rather than pulling in a dependency for it.
 */
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SVG_PATH = `${ROOT}/public/favicon.svg`
const BRAND_DARK = '#172554'

// `favicon.svg` has a 64x64 viewBox and no width/height, so sharp's default
// rasterization is 64x64. Resizing that raster up for the larger sizes below
// would upscale a bitmap instead of rendering the vector — rasterize
// straight from the SVG at each target size instead.
const rasterize = (size) =>
  sharp(SVG_PATH, { density: (72 * size) / 64 }).resize(size, size)

// apple-touch-icon.png: 180x180, opaque (flattened onto brand-dark).
const appleTouchIcon = await rasterize(180)
  .flatten({ background: BRAND_DARK })
  .png()
  .toBuffer()
await writeFile(`${ROOT}/public/apple-touch-icon.png`, appleTouchIcon)
console.log('wrote public/apple-touch-icon.png (180x180)')

// favicon.ico: 16, 32, 48px PNG-compressed entries.
const sizes = [16, 32, 48]
const pngs = await Promise.all(
  sizes.map((size) => rasterize(size).png().toBuffer())
)

const ICONDIR_SIZE = 6
const ICONDIRENTRY_SIZE = 16

const iconDir = Buffer.alloc(ICONDIR_SIZE)
iconDir.writeUInt16LE(0, 0) // reserved
iconDir.writeUInt16LE(1, 2) // type: 1 = icon
iconDir.writeUInt16LE(sizes.length, 4) // image count

let offset = ICONDIR_SIZE + ICONDIRENTRY_SIZE * sizes.length
const entries = []
for (const [i, size] of sizes.entries()) {
  const png = pngs[i]
  const entry = Buffer.alloc(ICONDIRENTRY_SIZE)
  entry.writeUInt8(size === 256 ? 0 : size, 0) // width (0 means 256)
  entry.writeUInt8(size === 256 ? 0 : size, 1) // height (0 means 256)
  entry.writeUInt8(0, 2) // color count (0 = not palette-indexed)
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8) // image data size
  entry.writeUInt32LE(offset, 12) // offset of image data
  entries.push(entry)
  offset += png.length
}

const ico = Buffer.concat([iconDir, ...entries, ...pngs])
await writeFile(`${ROOT}/public/favicon.ico`, ico)
console.log(
  `wrote public/favicon.ico (${sizes.map((s) => `${s}x${s}`).join(', ')})`
)
