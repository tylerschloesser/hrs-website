/**
 * GitHub OAuth handler for Sveltia CMS, ported to an AWS Lambda Function URL.
 *
 * This is a Lambda port of the GitHub half of `sveltia/sveltia-cms-auth`
 * (https://github.com/sveltia/sveltia-cms-auth), MIT licensed,
 * Copyright (c) 2026 Kohei Yoshino. GitLab support has been dropped: this
 * site only ever authenticates against GitHub, and a dead provider branch is
 * dead security surface. The `/auth` + `/callback` protocol, the CSRF cookie
 * scheme and the `postMessage` handshake in {@link outputHTML} are preserved
 * byte-for-byte in behavior, because Sveltia CMS's client-side code expects
 * this exact handshake.
 *
 * See the upstream `LICENSE.txt` for the full MIT license text.
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager'
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda'

/** The only backend this authenticator ever issues tokens for. */
const PROVIDER = 'github'

/**
 * OAuth scope for GitHub: the scope to request when the client doesn't ask
 * for one, the separator GitHub expects between multiple scopes, and the
 * scopes that may be requested.
 *
 * A client can ask for a narrower scope than the default — Sveltia CMS does
 * this with its `auth_scope` backend option, so a public repository doesn't
 * require access to a contributor's private ones — but only from this list.
 * The endpoint is reachable by anyone, and a token minted with a wider scope
 * than the CMS needs keeps that scope for every later sign-in, so the
 * request is not taken on trust. Anything unrecognized falls back to the
 * default.
 * @see https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 */
const GITHUB_SCOPE = {
  default: 'repo,user',
  separator: ',',
  allowed: ['repo', 'public_repo', 'user', 'read:user', 'user:email'],
}

/** Environment values the pure handlers need. Mirrors upstream's `env`. */
export interface CmsAuthEnv {
  ALLOWED_DOMAINS?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

interface AuthRequest {
  queryStringParameters?: Record<string, string | undefined>
}

interface CallbackRequest {
  queryStringParameters?: Record<string, string | undefined>
  cookies?: string[]
}

/**
 * Work out the OAuth scope to request from GitHub.
 * @param requested - The `scope` query parameter, if any. Scopes may be
 * comma- or space-separated.
 * @returns Scope to request.
 */
export const getScope = (requested?: string): string => {
  const { default: fallback, separator, allowed } = GITHUB_SCOPE
  const scopes = (requested ?? '').split(/[\s,]+/).filter(Boolean)

  if (!scopes.length) {
    return fallback
  }

  if (scopes.every((scope) => allowed.includes(scope))) {
    return scopes.join(separator)
  }

  // The default is wider than what was asked for, so a client that meant to
  // narrow the scope silently doesn't. Leave a trace for whoever is running
  // the function.
  console.warn(
    `Ignoring the unsupported "${requested}" scope for github; requesting "${fallback}".`
  )

  return fallback
}

/**
 * Escape the given string for safe use in a regular expression.
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
 */
const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Convert the `ALLOWED_DOMAINS` environment variable into a list of anchored
 * regular expression sources. The sources are used both here and in the
 * client-side script embedded in {@link outputHTML}, so a hostname is
 * matched by the exact same rules on either side.
 * @param allowedDomains - Comma-separated list of hostnames, which may
 * contain a wildcard (`*`).
 * @returns Regular expression sources. Empty if the variable is not
 * configured — which means "allow all".
 */
export const getDomainPatterns = (allowedDomains?: string): string[] =>
  (allowedDomains ?? '')
    .split(/,/)
    .map((str) => str.trim())
    .filter(Boolean)
    // Escape the input, then replace a wildcard for regex.
    .map((str) => `^${escapeRegExp(str).replaceAll('\\*', '.+')}$`)

/**
 * Serialize the given value for safe embedding in an inline `<script>`
 * block.
 */
const serialize = (value: unknown): string =>
  JSON.stringify(value ?? null).replaceAll('<', '\\u003c')

interface OutputHtmlArgs {
  provider?: string
  token?: string
  error?: string
  errorCode?: string
  env: CmsAuthEnv
}

/**
 * Build the HTML response that communicates with the window opener.
 */
export const outputHTML = ({
  provider = 'unknown',
  token,
  error,
  errorCode,
  env,
}: OutputHtmlArgs): APIGatewayProxyStructuredResultV2 => {
  const state = error ? 'error' : 'success'
  const content = error ? { provider, error, errorCode } : { provider, token }

  const body = `
      <!doctype html><html><body><script>
        (() => {
          const trustedPatterns = ${serialize(getDomainPatterns(env.ALLOWED_DOMAINS))};
          const hasToken = ${serialize(!!token)};

          const isTrusted = (origin) => {
            try {
              const { hostname } = new URL(origin);

              return trustedPatterns.some((pattern) => new RegExp(pattern).test(hostname));
            } catch {
              return false;
            }
          };

          window.addEventListener('message', ({ data, origin }) => {
            if (data !== 'authorizing:${provider}') {
              return;
            }

            // Unlike the site_id parameter, which the caller supplies, the origin of a message
            // event is set by the browser and cannot be forged by the sender, so it's the only
            // reliable indication of who opened this popup. An error carries no secret, so it's
            // always passed through to keep the sign-in screen informative
            if (hasToken && trustedPatterns.length && !isTrusted(origin)) {
              return;
            }

            window.opener?.postMessage(
              'authorization:${provider}:${state}:${JSON.stringify(content)}',
              origin
            );
          });
          window.opener?.postMessage('authorizing:${provider}', '*');
        })();
      </script></body></html>
    `

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // This page carries the access token in its markup. Nothing should
      // keep a copy of it.
      'Cache-Control': 'no-store',
    },
    // Delete the CSRF cookie.
    cookies: [
      'csrf-token=deleted; HttpOnly; Max-Age=0; Path=/; SameSite=Lax; Secure',
    ],
    body,
  }
}

/**
 * Handle the `auth` request, the first step in the authorization flow.
 */
export const handleAuth = (
  request: AuthRequest,
  env: CmsAuthEnv
): APIGatewayProxyStructuredResultV2 => {
  const {
    provider,
    site_id: domain,
    scope: requestedScope,
  } = request.queryStringParameters ?? {}

  if (!provider || provider !== PROVIDER) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    })
  }

  const scope = getScope(requestedScope)
  const { ALLOWED_DOMAINS, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env
  const domainPatterns = getDomainPatterns(ALLOWED_DOMAINS)

  // Check if the domain is whitelisted.
  if (
    domainPatterns.length &&
    !domainPatterns.some((pattern) => new RegExp(pattern).test(domain ?? ''))
  ) {
    return outputHTML({
      env,
      provider,
      error: 'Your domain is not allowed to use the authenticator.',
      errorCode: 'UNSUPPORTED_DOMAIN',
    })
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return outputHTML({
      env,
      provider,
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    })
  }

  // Generate a random string for CSRF protection.
  const csrfToken = crypto.randomUUID().replaceAll('-', '')

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope,
    state: csrfToken,
  })

  const authURL = `https://github.com/login/oauth/authorize?${params.toString()}`

  return {
    statusCode: 302,
    headers: {
      Location: authURL,
    },
    // Cookie expires in 10 minutes; use `SameSite=Lax` to make sure the
    // cookie is sent by the browser after redirect.
    cookies: [
      `csrf-token=${provider}_${csrfToken}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax; Secure`,
    ],
    body: '',
  }
}

/**
 * Handle the `callback` request, the second step in the authorization flow.
 */
export const handleCallback = async (
  request: CallbackRequest,
  env: CmsAuthEnv
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { code, state } = request.queryStringParameters ?? {}
  const cookieHeader = (request.cookies ?? []).join('; ')
  const [, provider, csrfToken] =
    cookieHeader.match(/\bcsrf-token=([a-z-]+?)_([0-9a-f]{32})\b/) ?? []

  if (!provider || provider !== PROVIDER) {
    return outputHTML({
      env,
      error: 'Your Git backend is not supported by the authenticator.',
      errorCode: 'UNSUPPORTED_BACKEND',
    })
  }

  if (!code || !state) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to receive an authorization code. Please try again later.',
      errorCode: 'AUTH_CODE_REQUEST_FAILED',
    })
  }

  if (!csrfToken || state !== csrfToken) {
    return outputHTML({
      env,
      provider,
      error: 'Potential CSRF attack detected. Authentication flow aborted.',
      errorCode: 'CSRF_DETECTED',
    })
  }

  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return outputHTML({
      env,
      provider,
      error: 'OAuth app client ID or secret is not configured.',
      errorCode: 'MISCONFIGURED_CLIENT',
    })
  }

  const requestBody = {
    code,
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
  }

  let response: Response | undefined

  try {
    response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })
  } catch {
    //
  }

  if (!response) {
    return outputHTML({
      env,
      provider,
      error: 'Failed to request an access token. Please try again later.',
      errorCode: 'TOKEN_REQUEST_FAILED',
    })
  }

  let token = ''
  let error = ''

  try {
    ;({ access_token: token, error } = await response.json())
  } catch {
    return outputHTML({
      env,
      provider,
      error: 'Server responded with malformed data. Please try again later.',
      errorCode: 'MALFORMED_RESPONSE',
    })
  }

  return outputHTML({ env, provider, token, error })
}

interface CmsAuthSecret {
  client_id: string
  client_secret: string
}

// Cached lazily at cold start. A rejected promise is not cached — a failed
// fetch (e.g. a transient Secrets Manager error) gets a fresh attempt on the
// next invocation rather than failing every request forever.
let secretPromise: Promise<CmsAuthSecret> | undefined

const fetchSecret = async (): Promise<CmsAuthSecret> => {
  const secretName = process.env.CMS_AUTH_SECRET_NAME

  if (!secretName) {
    throw new Error('CMS_AUTH_SECRET_NAME is not set')
  }

  const client = new SecretsManagerClient({})
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: secretName })
  )

  if (!SecretString) {
    throw new Error(`Secret "${secretName}" has no SecretString`)
  }

  return JSON.parse(SecretString) as CmsAuthSecret
}

const getSecret = (): Promise<CmsAuthSecret> => {
  if (!secretPromise) {
    secretPromise = fetchSecret().catch((error: unknown) => {
      secretPromise = undefined
      throw error
    })
  }

  return secretPromise
}

/**
 * The Lambda Function URL entry point. A thin shell: loads the secret and
 * environment once, routes on method + path, and delegates to the pure
 * handlers above.
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> => {
  const { method, path } = event.requestContext.http

  if (method !== 'GET') {
    return { statusCode: 404, body: '' }
  }

  if (['/auth', '/oauth/authorize'].includes(path)) {
    return handleAuth(
      { queryStringParameters: event.queryStringParameters },
      await buildEnv()
    )
  }

  if (['/callback', '/oauth/redirect'].includes(path)) {
    return handleCallback(
      {
        queryStringParameters: event.queryStringParameters,
        cookies: event.cookies,
      },
      await buildEnv()
    )
  }

  return { statusCode: 404, body: '' }
}

const buildEnv = async (): Promise<CmsAuthEnv> => {
  // A failed secret fetch is treated the same as a missing one: the pure
  // handlers already turn a missing client id/secret into the
  // `MISCONFIGURED_CLIENT` error response. Log it, though — otherwise the
  // only symptom is an editor being told the app is misconfigured, with
  // nothing in CloudWatch saying why.
  const secret = await getSecret().catch((error: unknown) => {
    console.error('failed to read the CMS auth secret', error)

    return undefined
  })

  return {
    ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
    GITHUB_CLIENT_ID: secret?.client_id,
    GITHUB_CLIENT_SECRET: secret?.client_secret,
  }
}
