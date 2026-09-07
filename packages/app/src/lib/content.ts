import { getEntry, type CollectionEntry } from 'astro:content'

type Singleton = 'site' | 'home' | 'events' | 'contacts'

/**
 * Read one of the singleton entries. Every singleton is required, so a missing
 * file is a build error rather than something every caller has to handle.
 *
 * The return type is annotated explicitly: `getEntry` narrows through a
 * conditional-type overload, which TypeScript cannot resolve against a generic
 * type parameter, so inference alone would widen the result to a union of all
 * four singleton shapes.
 */
export async function getSingleton<T extends Singleton>(
  name: T
): Promise<CollectionEntry<T>['data']> {
  const entry = await getEntry(name as Singleton, name)
  if (!entry) {
    throw new Error(`missing singleton: src/content/${name}.yml`)
  }
  return entry.data as CollectionEntry<T>['data']
}
