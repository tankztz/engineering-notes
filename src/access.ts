import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { bodyLimit } from 'hono/body-limit'
import { type Env } from './knowledge.ts'

export type AppEnv = { Bindings: Env; Variables: { isAdmin: boolean; userId: string } }
export const hashToken = (value: string) => createHash('sha256').update(value).digest('base64url')
export const newToken = () => Buffer.from(randomBytes(32)).toString('base64url')
export const validToken = (value: string) => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
const authOrigin = 'https://auth.syntaxskills.com'
const cookieOptions = { path: '/', secure: true, httpOnly: true, sameSite: 'Lax' as const }
const sessionCookie = '__Host-notes-session'
const loginCookie = '__Host-notes-login'

function returnPath(value = '/') {
  try {
    const url = new URL(value.slice(0, 2000), 'https://notes.invalid')
    return url.origin === 'https://notes.invalid' && !url.pathname.startsWith('/auth/') ? url.pathname + url.search : '/'
  } catch { return '/' }
}

export function adminToken(request: Request, env: Env) {
  const supplied = Buffer.from(request.headers.get('authorization')?.replace(/^Bearer /, '') ?? '')
  const expected = Buffer.from(env.ADMIN_TOKEN ?? '')
  return !!expected.length && supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

export const access = new Hono<AppEnv>()
access.use('*', async (c, next) => {
  c.header('Cache-Control', 'private, no-store')
  c.header('Referrer-Policy', 'no-referrer')
  c.header('X-Robots-Tag', 'noindex, nofollow, noarchive')
  const url = new URL(c.req.url)
  if (c.env.SITE_URL && url.origin !== c.env.SITE_URL && !['localhost', '127.0.0.1'].includes(url.hostname)) {
    return c.redirect(c.env.SITE_URL + url.pathname + url.search, 308)
  }
  const path = c.req.path
  if (['/style.css', '/app.js', '/favicon.svg', '/robots.txt'].includes(path) || path.startsWith('/auth/') || path.startsWith('/share/') || path.startsWith('/api/admin/')) return next()
  if (adminToken(c.req.raw, c.env)) {
    c.set('isAdmin', true)
    c.set('userId', 'admin')
    return next()
  }
  const token = getCookie(c, sessionCookie) ?? ''
  if (validToken(token)) {
    const session = await c.env.DB.prepare('SELECT auth_cookie FROM web_sessions WHERE token_hash = ? AND expires_at > ?').bind(hashToken(token), Date.now()).first<{ auth_cookie: string }>()
    if (session) {
      // Revalidate centrally so SyntaxSkills logout and session revocation take effect here.
      const response = await fetch(`${authOrigin}/api/session`, { headers: { cookie: session.auth_cookie }, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error('Login service unavailable')
      const data = await response.json() as { user?: { id?: string } }
      if (data.user?.id) {
        c.set('userId', data.user.id)
        return next()
      }
      await c.env.DB.prepare('DELETE FROM web_sessions WHERE token_hash = ?').bind(hashToken(token)).run()
    }
    deleteCookie(c, sessionCookie, cookieOptions)
  }
  const login = `/auth/login?next=${encodeURIComponent(url.pathname + url.search)}`
  if (path.startsWith('/api/') || /\.(md|txt|json|xml)$/.test(path) || c.req.header('accept')?.includes('text/markdown')) return c.json({ error: 'SyntaxSkills login required', login_url: login }, 401)
  return c.redirect(login)
})

access.get('/auth/login', c => {
  const verifier = newToken()
  const state = hashToken(verifier)
  setCookie(c, loginCookie, JSON.stringify({ verifier, next: returnPath(c.req.query('next')) }), { ...cookieOptions, maxAge: 600 })
  return c.redirect(`${authOrigin}/api/notes-sso?state=${state}&code_challenge=${state}`)
})

access.get('/auth/callback', async c => {
  let pending: { verifier?: string; next?: string } = {}
  try { pending = JSON.parse(getCookie(c, loginCookie) ?? '{}') } catch { /* Reject malformed cookies below. */ }
  const code = c.req.query('code') ?? ''
  if (!validToken(pending.verifier ?? '') || !validToken(code) || c.req.query('state') !== hashToken(pending.verifier!)) return c.text('Invalid login callback. Start login again.', 400)
  deleteCookie(c, loginCookie, cookieOptions)
  const response = await fetch(`${authOrigin}/api/notes-sso`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: pending.verifier }), signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) return c.text('Login expired. Start login again.', 401)
  const data = await response.json() as { cookie: string; expiresAt: string }
  const expires = Math.min(Date.parse(data.expiresAt), Date.now() + 30 * 86400_000)
  if (!/^__Secure-syntaxskills-auth\.session_token=[^;\s]+$/.test(data.cookie) || !Number.isFinite(expires) || expires <= Date.now()) throw new Error('Invalid login response')
  const token = newToken()
  await c.env.DB.prepare('DELETE FROM web_sessions WHERE expires_at <= ?').bind(Date.now()).run()
  await c.env.DB.prepare('INSERT INTO web_sessions(token_hash,auth_cookie,expires_at) VALUES(?,?,?)').bind(hashToken(token), data.cookie, expires).run()
  setCookie(c, sessionCookie, token, { ...cookieOptions, maxAge: Math.floor((expires - Date.now()) / 1000) })
  return c.redirect(returnPath(pending.next))
})

access.use('/auth/logout', bodyLimit({ maxSize: 1024 }))
access.post('/auth/logout', async c => {
  if (c.req.header('origin') !== new URL(c.req.url).origin) return c.text('Invalid request origin', 403)
  await c.env.DB.prepare('DELETE FROM web_sessions WHERE token_hash = ?').bind(hashToken(getCookie(c, sessionCookie) ?? '')).run()
  deleteCookie(c, sessionCookie, cookieOptions)
  return c.redirect(`${authOrigin}/logout?redirect=${encodeURIComponent(authOrigin + '/login')}`, 303)
})
