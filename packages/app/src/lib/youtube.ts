const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
])

const ID = /^[\w-]{11}$/

/**
 * Extract the 11-character video id from the YouTube URL shapes an editor is
 * likely to paste (`watch?v=`, `youtu.be/`, `/embed/`, `/shorts/`, `/live/`).
 * Returns `null` for anything else, so callers can fall back to not embedding.
 */
export function youtubeId(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (!HOSTS.has(parsed.hostname)) return null

  const segments = parsed.pathname.split('/').filter(Boolean)
  let candidate: string | undefined
  if (parsed.hostname === 'youtu.be') {
    candidate = segments[0]
  } else if (segments[0] === 'watch') {
    candidate = parsed.searchParams.get('v') ?? undefined
  } else if (
    segments[0] === 'embed' ||
    segments[0] === 'shorts' ||
    segments[0] === 'live'
  ) {
    candidate = segments[1]
  }

  return candidate && ID.test(candidate) ? candidate : null
}
