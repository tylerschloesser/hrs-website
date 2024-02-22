import * as fs from 'fs'
import * as path from 'path'
import invariant from 'tiny-invariant'

export type WebpackManifest = {
  'index.html': string
} & Record<string, string>

export const WEBPACK_MANIFEST_FILE_NAME: string = 'manifest.json'

function getWebpackManifest(distPath: string): WebpackManifest {
  return JSON.parse(
    fs.readFileSync(path.join(distPath, WEBPACK_MANIFEST_FILE_NAME), 'utf8')
  )
}

export function getDefaultRootObject(distPath: string): string {
  const manifest = getWebpackManifest(distPath)

  // should look like /index.9c763277af2205a9b76d.html
  invariant(manifest['index.html'].match(/^\/index\.[a-z0-9]{20}\.html$/))

  return path.basename(manifest['index.html'])
}
