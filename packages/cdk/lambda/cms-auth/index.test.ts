import assert from 'node:assert/strict'
import test from 'node:test'
import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import {
  getDomainPatterns,
  getScope,
  handleAuth,
  handleCallback,
  handler,
} from './index.js'

const ALLOWED_DOMAINS = 'haitianrelief.org'

const baseEnv = {
  ALLOWED_DOMAINS,
  GITHUB_CLIENT_ID: 'client-id',
  GITHUB_CLIENT_SECRET: 'client-secret',
}

const bodyOf = (result: { body?: string }) => result.body ?? ''

test('handleAuth: disallowed site_id gets UNSUPPORTED_DOMAIN and no redirect', () => {
  const result = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'evil.example.com',
      },
    },
    baseEnv
  )

  assert.equal(result.statusCode, 200)
  assert.equal(result.headers?.Location, undefined)
  assert.match(bodyOf(result), /UNSUPPORTED_DOMAIN/)
})

test('getDomainPatterns: wildcard matches, but does not over-match a similar-looking domain', () => {
  const patterns = getDomainPatterns('*.haitianrelief.org,haitianrelief.org')
  const matches = (hostname: string) =>
    patterns.some((pattern) => new RegExp(pattern).test(hostname))

  assert.equal(matches('preview.haitianrelief.org'), true)
  assert.equal(matches('haitianrelief.org'), true)
  assert.equal(matches('evil-haitianrelief.org'), false)
})

test('handleAuth: wildcard ALLOWED_DOMAINS allows a matching site_id', () => {
  const result = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'preview.haitianrelief.org',
      },
    },
    { ...baseEnv, ALLOWED_DOMAINS: '*.haitianrelief.org' }
  )

  assert.equal(result.statusCode, 302)
})

test('handleAuth: production ALLOWED_DOMAINS allows the apex and rejects a subdomain', () => {
  const allowed = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'haitianrelief.org',
      },
    },
    { ...baseEnv, ALLOWED_DOMAINS: 'haitianrelief.org' }
  )
  assert.equal(allowed.statusCode, 302)

  const rejected = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'preview.haitianrelief.org',
      },
    },
    { ...baseEnv, ALLOWED_DOMAINS: 'haitianrelief.org' }
  )
  assert.equal(rejected.statusCode, 200)
  assert.match(bodyOf(rejected), /UNSUPPORTED_DOMAIN/)
})

test('handleAuth: unsupported provider gets UNSUPPORTED_BACKEND', () => {
  const result = handleAuth(
    {
      queryStringParameters: {
        provider: 'gitlab',
        site_id: 'haitianrelief.org',
      },
    },
    baseEnv
  )

  assert.equal(result.statusCode, 200)
  assert.match(bodyOf(result), /UNSUPPORTED_BACKEND/)
})

test('handleCallback: state not matching the cookie gets CSRF_DETECTED', async () => {
  const result = await handleCallback(
    {
      queryStringParameters: { code: 'abc', state: 'not-the-token' },
      cookies: ['csrf-token=github_00000000000000000000000000000000'],
    },
    baseEnv
  )

  assert.match(bodyOf(result), /CSRF_DETECTED/)
})

test('handleCallback: no cookie at all (an expired CSRF cookie) gets CSRF_TOKEN_EXPIRED and a renderable popup', async () => {
  const result = await handleCallback(
    { queryStringParameters: { code: 'abc', state: 'xyz' } },
    baseEnv
  )

  assert.match(bodyOf(result), /CSRF_TOKEN_EXPIRED/)
  assert.match(bodyOf(result), /try signing in again/)
  // The popup only renders if the emitted script listens for the provider
  // Sveltia's client actually announces itself as; `provider: 'unknown'`
  // (the outputHTML default) would leave it listening for
  // `authorizing:unknown`, which is never sent.
  assert.match(bodyOf(result), /authorizing:github/)
})

test('handleCallback: a cookie name that merely ends in csrf-token= is not mistaken for ours', async () => {
  const result = await handleCallback(
    {
      queryStringParameters: { code: 'abc', state: 'xyz' },
      cookies: ['my-csrf-token=github_00000000000000000000000000000000'],
    },
    baseEnv
  )

  assert.match(bodyOf(result), /CSRF_TOKEN_EXPIRED/)
})

const CSRF_TOKEN = '0'.repeat(32)

const validCallbackRequest = {
  queryStringParameters: { code: 'abc', state: CSRF_TOKEN },
  cookies: [`csrf-token=github_${CSRF_TOKEN}`],
}

test('handleCallback: a fetch failure is logged and reported as TOKEN_REQUEST_FAILED', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('network down')
  })
  const errorMock = t.mock.method(console, 'error', () => {})

  const result = await handleCallback(validCallbackRequest, baseEnv)

  assert.equal(fetchMock.mock.calls.length, 1)
  assert.ok(errorMock.mock.calls.length > 0)
  assert.match(bodyOf(result), /TOKEN_REQUEST_FAILED/)
})

test('handleCallback: a non-ok response is reported as TOKEN_REQUEST_FAILED, not success', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { status: 401 })
  )
  t.mock.method(console, 'error', () => {})

  const result = await handleCallback(validCallbackRequest, baseEnv)

  assert.match(bodyOf(result), /TOKEN_REQUEST_FAILED/)
  assert.match(bodyOf(result), /authorization:github:error:/)
})

test('handleCallback: a token-less 200 response is reported as an error, not success', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('{}', { status: 200 })
  )

  const result = await handleCallback(validCallbackRequest, baseEnv)

  // Before the fix, an empty-but-ok response computed `state: 'success'`
  // with no token — a silently broken CMS session instead of a visible
  // failure.
  assert.match(bodyOf(result), /authorization:github:error:/)
  assert.doesNotMatch(bodyOf(result), /authorization:github:success:/)
})

test('handleAuth: a valid request redirects to github.com with client_id, scope and a matching state', () => {
  const result = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'haitianrelief.org',
      },
    },
    baseEnv
  )

  assert.equal(result.statusCode, 302)

  const location = result.headers?.Location
  assert.equal(typeof location, 'string')

  const url = new URL(String(location))
  assert.equal(url.origin, 'https://github.com')
  assert.equal(url.pathname, '/login/oauth/authorize')
  assert.equal(url.searchParams.get('client_id'), 'client-id')
  assert.equal(url.searchParams.get('scope'), 'repo,user')

  const state = url.searchParams.get('state')
  assert.ok(state)

  const cookie = result.cookies?.[0]
  assert.ok(cookie)
  assert.match(String(cookie), new RegExp(`^csrf-token=github_${state}\\b`))
  assert.match(String(cookie), /HttpOnly/)
  assert.match(String(cookie), /Secure/)
  assert.match(String(cookie), /SameSite=Lax/)
})

test('getScope: a narrower requested scope is honoured', () => {
  assert.equal(getScope('public_repo'), 'public_repo')
})

test('getScope: an unsupported scope falls back to the default', () => {
  assert.equal(getScope('admin:org'), 'repo,user')
})

test('handleAuth: scope narrowing is applied end to end', () => {
  const narrowed = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'haitianrelief.org',
        scope: 'public_repo',
      },
    },
    baseEnv
  )
  const narrowedUrl = new URL(String(narrowed.headers?.Location))
  assert.equal(narrowedUrl.searchParams.get('scope'), 'public_repo')

  const fallback = handleAuth(
    {
      queryStringParameters: {
        provider: 'github',
        site_id: 'haitianrelief.org',
        scope: 'admin:org',
      },
    },
    baseEnv
  )
  const fallbackUrl = new URL(String(fallback.headers?.Location))
  assert.equal(fallbackUrl.searchParams.get('scope'), 'repo,user')
})

const eventFor = (method: string, path: string): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: '$default',
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      http: { method, path },
    },
  }) as unknown as APIGatewayProxyEventV2

test('handler: an unknown path 404s with an empty body', async () => {
  const result = await handler(eventFor('GET', '/nope'))
  assert.equal(result.statusCode, 404)
  assert.equal(result.body ?? '', '')
})

test('handler: a POST 404s with an empty body', async () => {
  const result = await handler(eventFor('POST', '/auth'))
  assert.equal(result.statusCode, 404)
  assert.equal(result.body ?? '', '')
})
