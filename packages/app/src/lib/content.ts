import { getEntry } from 'astro:content'

type Singleton = 'site' | 'home' | 'events' | 'contacts'

/**
 * Read one of the singleton entries. Every singleton is required, so a missing
 * file is a build error rather than something every caller has to handle.
 */
export async function getSingleton<T extends Singleton>(name: T) {
  const entry = await getEntry(name, name)
  if (!entry) {
    throw new Error(`missing singleton: src/content/${name}.yml`)
  }
  return entry.data
}
