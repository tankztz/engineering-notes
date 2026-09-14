import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { URL } from 'node:url'
import { hashToken } from '../src/access.ts'
import { app } from '../src/index.ts'
import { allLessons, lessonSchema, markdown, saveLessons, searchLessons, type Env, type Lesson } from '../src/knowledge.ts'
import { evidenceText, syncSource, validateExtraction } from '../src/sync.ts'

const seeds = readdirSync(new URL('../content/', import.meta.url)).filter(name => name.endsWith('.json')).map(name => lessonSchema.parse(JSON.parse(readFileSync(new URL(`../content/${name}`, import.meta.url), 'utf8'))))
const sample = seeds.find(lesson => lesson.slug.includes('hover'))!

function database() {
  const sqlite = new DatabaseSync(':memory:')
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).sort()) sqlite.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'))
  function prepare(sql: string) {
    let values: unknown[] = []
    return {
      bind(...params: unknown[]) { values = params; return this },
      async first() { return sqlite.prepare(sql).get(...values as []) ?? null },
      async all() { return { results: sqlite.prepare(sql).all(...values as []) } },
      async run() { return { success: true, meta: sqlite.prepare(sql).run(...values as []) } },
    }
  }
  const DB = {
    prepare,
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN')
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result }
      catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  } as unknown as D1Database
  return { sqlite, DB }
}

function environment(DB: D1Database) {
  return { DB, ADMIN_TOKEN: 'test-secret',
    AI: { async run() { return { data: [Array(1024).fill(0.1)] } } },
    LESSONS: { async upsert() {}, async query() { return { matches: [] } } },
  } as unknown as Env
}

test('seed articles follow the English format with exact commit evidence', () => {
  assert.equal(seeds.length, 4)
  for (const lesson of seeds) {
    const md = markdown(lesson)
    for (const heading of ['When to use this lesson', 'Behavior to preserve', 'Symptoms', 'Root cause', 'Solution', 'Verification', 'Applicability', 'Commit evidence']) assert.ok(md.includes(`## ${heading}`))
    assert.doesNotMatch(md, /\p{Script=Han}/u)
    assert.ok(lesson.commits.every(commit => md.includes(`/commit/${commit.sha}`)))
  }
  assert.throws(() => lessonSchema.parse({ ...sample, title: '\u4e2d\u6587' }), /English/)
  assert.throws(() => lessonSchema.parse({ ...sample, commits: [{ sha: '1234567', note: 'Short SHA' }] }))
})

test('published HTML, Markdown, agent discovery, search and failure paths work against real SQL', async () => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  try {
    await saveLessons(env, seeds)
    for (const path of ['/', '/llms.txt', '/llms-full.txt', '/api/index.json', '/api/export', '/agents', '/agents.md', '/openapi.json', '/status', `/lessons/${sample.slug}`, `/lessons/${sample.slug}.md`]) {
      const response = await app.request(`https://notes.example.com${path}`, { headers: { authorization: 'Bearer test-secret' } }, env)
      assert.equal(response.status, 200, path)
      assert.doesNotMatch(await response.text(), /\p{Script=Han}/u)
    }
    const md = await app.request(`https://notes.example.com/lessons/${sample.slug}`, { headers: { accept: 'text/markdown', authorization: 'Bearer test-secret' } }, env)
    assert.match(md.headers.get('content-type')!, /text\/markdown/)
    assert.equal(await md.text(), markdown(sample))
    const search = await searchLessons(env, 'hover flicker')
    assert.equal(search.results[0].slug, sample.slug)
    env.LESSONS.query = (async () => ({ count: 2, matches: [
      { id: 'muxmap-preserve-selection-on-outside-click', score: 0.58 },
      { id: sample.slug, score: 0.54 },
    ] })) as VectorizeIndex['query']
    const paraphrase = await searchLessons(env, 'a card briefly vanishes then comes back after I click elsewhere')
    assert.equal(paraphrase.results[0].slug, 'muxmap-preserve-selection-on-outside-click')
    env.AI.run = async () => { throw new Error('Embedding service unavailable') }
    const fallback = await searchLessons(env, 'horizontal overflow')
    assert.equal(fallback.mode, 'keyword')
    assert.equal(fallback.results[0].slug, 'muxmap-markdown-table-overflow')
    assert.equal((await app.request('/api/search?q=', { headers: { authorization: 'Bearer test-secret' } }, env)).status, 400)
    assert.equal((await app.request('/api/admin/status', {}, env)).status, 401)
    assert.equal((await app.request('/lessons/missing', { headers: { authorization: 'Bearer test-secret' } }, env)).status, 404)
  } finally { sqlite.close() }
})

test('failed indexing preserves the previous document; successful revisions retain history', async () => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  try {
    await saveLessons(env, [sample])
    const updated = { ...sample, summary: 'Updated explanation' }
    const previousRun = env.AI.run
    env.AI.run = async () => { throw new Error('Model unavailable') }
    await assert.rejects(saveLessons(env, [updated]))
    assert.equal((await allLessons(env))[0].summary, sample.summary)
    env.AI.run = previousRun
    await saveLessons(env, [updated])
    assert.equal((await allLessons(env))[0].summary, updated.summary)
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM revisions').get()!.count, 1)
  } finally { sqlite.close() }
})

test('SyntaxSkills login gates every collection route and share links grant only one revocable article', async t => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  const origin = 'https://notes.example.com'
  const token = 's'.repeat(43)
  let userId: string | null = 'user-1'
  let authCalls = 0
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    authCalls++
    if (url.endsWith('/api/notes-sso')) {
      assert.equal(init.method, 'POST')
      assert.ok(JSON.parse(init.body as string).code_verifier)
      return Response.json({ cookie: '__Secure-syntaxskills-auth.session_token=signed-session', expiresAt: new Date(Date.now() + 86400_000).toISOString() })
    }
    assert.equal(new Headers(init.headers).get('cookie'), '__Secure-syntaxskills-auth.session_token=signed-session')
    return Response.json({ user: userId ? { id: userId } : null })
  })
  const signed = { cookie: `__Host-notes-session=${token}`, origin }
  const request = (path: string, init: RequestInit = {}) => app.request(origin + path, init, env)
  const privatePaths = ['/', '/search?q=hover', '/api/search?q=hover', '/api/index.json', '/api/export', '/llms.txt', '/llms-full.txt', '/agents', '/agents.md', '/openapi.json', '/status', '/sitemap.xml', '/health', `/lessons/${sample.slug}`, `/lessons/${sample.slug}.md`]
  try {
    await saveLessons(env, seeds)
    for (const path of privatePaths) {
      const response = await request(path)
      assert.ok([302, 401].includes(response.status), path)
      assert.match(response.headers.get('cache-control')!, /no-store/)
      assert.ok(!(await response.text()).includes(sample.title), path)
    }
    assert.equal((await request(`/api/lessons/${sample.slug}/share`, { method: 'POST' })).status, 401)
    assert.equal((await request('/api/export', { headers: { cookie: '__Host-notes-session=forged' } })).status, 401)
    env.SITE_URL = origin
    const legacy = await app.request(`https://engineering-notes.tankztz.workers.dev/lessons/${sample.slug}`, {}, env)
    assert.equal(legacy.status, 308)
    assert.equal(legacy.headers.get('location'), origin + `/lessons/${sample.slug}`)

    const start = await request(`/auth/login?next=${encodeURIComponent('/lessons/' + sample.slug)}`)
    const pending = start.headers.get('set-cookie')!.split(';')[0]
    const target = new URL(start.headers.get('location')!)
    assert.equal(target.origin, 'https://auth.syntaxskills.com')
    assert.match(start.headers.get('set-cookie')!, /HttpOnly; Secure; SameSite=Lax/)
    const state = target.searchParams.get('state')!
    const callback = `/auth/callback?code=${'c'.repeat(43)}&state=${state}`
    assert.equal((await request(callback)).status, 400)
    assert.equal((await request(callback.replace(state, 'wrong'), { headers: { cookie: pending } })).status, 400)
    assert.equal(authCalls, 0)
    const finish = await request(callback, { headers: { cookie: pending } })
    assert.equal(finish.status, 302)
    assert.equal(finish.headers.get('location'), '/lessons/' + sample.slug)
    assert.ok(finish.headers.getSetCookie().some(cookie => cookie.startsWith('__Host-notes-session=') && cookie.includes('HttpOnly')))
    const external = await request('/auth/login?next=https://evil.example/')
    const externalPending = JSON.parse(decodeURIComponent(external.headers.get('set-cookie')!.split(';')[0].split('=').slice(1).join('=')))
    assert.equal(externalPending.next, '/')

    sqlite.prepare('INSERT INTO web_sessions(token_hash,auth_cookie,expires_at) VALUES(?,?,?)').run(hashToken(token), '__Secure-syntaxskills-auth.session_token=signed-session', Date.now() + 86400_000)
    for (const path of privatePaths) {
      const response = await request(path, { headers: signed })
      assert.equal(response.status, 200, path)
      assert.match(response.headers.get('cache-control')!, /no-store/)
      assert.equal(response.headers.get('access-control-allow-origin'), null)
    }
    const sharePath = `/api/lessons/${sample.slug}/share`
    assert.equal((await request(sharePath, { method: 'POST', headers: { ...signed, origin: 'https://evil.example' } })).status, 403)
    assert.equal((await request(sharePath, { method: 'DELETE', headers: { cookie: signed.cookie } })).status, 403)
    const created = await request(sharePath, { method: 'POST', headers: signed })
    assert.equal(created.status, 201)
    const shared = new URL((await created.json() as { url: string }).url)
    const shareToken = shared.pathname.split('/').at(-1)!
    assert.equal(sqlite.prepare('SELECT token_hash FROM shares').get()!.token_hash, hashToken(shareToken))
    const callsBeforeShare = authCalls
    const sharedResponse = await request(shared.pathname)
    assert.equal(sharedResponse.status, 200)
    assert.equal(sharedResponse.headers.get('referrer-policy'), 'no-referrer')
    assert.match(sharedResponse.headers.get('x-robots-tag')!, /noindex/)
    const sharedHtml = await sharedResponse.text()
    assert.match(sharedHtml, /Access to this page only/)
    assert.ok(sharedHtml.includes(sample.title))
    assert.ok(sharedHtml.includes(`${shared.pathname}.md`))
    assert.doesNotMatch(sharedHtml, /Related lessons|header-search|data-share-slug|JSON index|All lessons/)
    for (const lesson of seeds.filter(lesson => lesson.slug !== sample.slug)) assert.ok(!sharedHtml.includes(lesson.title))
    assert.equal(await (await request(shared.pathname + '.md')).text(), markdown(sample))
    assert.equal(await (await request(shared.pathname, { headers: { accept: 'text/markdown' } })).text(), markdown(sample))
    assert.equal(authCalls, callsBeforeShare)
    const otherSlug = seeds.find(lesson => lesson.slug !== sample.slug)!.slug
    for (const path of [...privatePaths, `/lessons/${otherSlug}`, `/lessons/${otherSlug}.md`]) {
      const separator = path.includes('?') ? '&' : '?'
      const response = await request(`${path}${separator}share=${shareToken}`, { headers: { authorization: `Bearer ${shareToken}`, cookie: `__Host-notes-session=${shareToken}` } })
      assert.ok([302, 401].includes(response.status), path)
    }
    assert.equal((await request(shared.pathname + '/' + otherSlug)).status, 404)
    assert.equal((await request(sharePath, { method: 'DELETE', headers: { origin, authorization: `Bearer ${shareToken}` } })).status, 401)
    const rotated = new URL((await (await request(sharePath, { method: 'POST', headers: signed })).json() as { url: string }).url)
    assert.equal((await request(shared.pathname)).status, 404)
    userId = 'user-2'
    await request(sharePath, { method: 'DELETE', headers: signed })
    assert.equal((await request(rotated.pathname)).status, 200)
    userId = 'user-1'
    await request(sharePath, { method: 'DELETE', headers: signed })
    assert.equal((await request(rotated.pathname)).status, 404)
    assert.equal((await request(rotated.pathname + '.md')).status, 404)
    userId = null
    assert.equal((await request('/api/export', { headers: signed })).status, 401)
    assert.equal(sqlite.prepare('SELECT token_hash FROM web_sessions WHERE token_hash = ?').get(hashToken(token)), undefined)
    assert.equal((await request('/auth/logout', { method: 'POST', headers: { origin: 'https://evil.example' } })).status, 403)
    assert.equal((await request('/auth/logout', { method: 'POST', headers: signed })).status, 303)
  } finally { sqlite.close() }
})

test('extraction rejects fabricated references, cross-repository overwrites and duplicate slugs', () => {
  const commit = { sha: 'a'.repeat(40), commit: { message: 'Fix hover' } }
  const updated: Lesson = { ...sample, commits: [{ sha: commit.sha, note: 'New evidence' }] }
  assert.equal(validateExtraction({ lessons: [updated] }, sample.repo, [commit], [sample])[0].commits.length, 2)
  assert.throws(() => validateExtraction({ lessons: [{ ...updated, commits: [{ sha: 'b'.repeat(40), note: 'Invented' }] }] }, sample.repo, [commit], [sample]), /unsupported/)
  assert.throws(() => validateExtraction({ lessons: [updated, updated] }, sample.repo, [commit], [sample]), /Duplicate/)
  assert.throws(() => validateExtraction({ lessons: [updated] }, 'other/repo', [commit], [sample]), /repository/)
  const evidence = evidenceText({ ...commit, files: [{ filename: '.env.local', patch: 'secret=do-not-send' }, { filename: 'src/app.ts', patch: 'x'.repeat(90000) }] })
  assert.equal(evidence.files.length, 1)
  assert.equal(evidence.files[0].truncated, true)
  assert.ok(JSON.stringify(evidence).length < 13000)
})

test('automatic sync updates a lesson and advances its cursor only after successful publication', async t => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  const oldSha = 'a'.repeat(40), nextSha = 'b'.repeat(40)
  const generated = { ...sample, commits: [{ sha: nextSha, note: 'New fix evidence' }] }
  const commit = { sha: nextSha, commit: { message: 'Fix hover boundary flicker' }, files: [{ filename: 'src/nodeHover.ts', patch: '+ check pointer containment' }] }
  let isPrivate = false
  t.mock.method(globalThis, 'fetch', async (url: string) => Response.json(url.endsWith(sample.repo) ? { private: isPrivate } : url.includes('/compare/') ? { status: 'ahead', commits: [commit] } : commit))
  let fail = true
  let approve = true
  env.AI.run = (async (model: string, input: { messages?: unknown; response_format?: { type: string; json_schema: { properties: { lessons?: { maxItems: number } } } } }) => {
    if (input.messages) {
      if (model === '@cf/openai/gpt-oss-120b') return { response: { approved: approve ? [generated.slug] : [] } }
      assert.equal(input.response_format?.type, 'json_schema')
      assert.equal(input.response_format?.json_schema.properties.lessons?.maxItems, 3)
      if (fail) throw new Error('Temporary inference failure')
      return { response: { lessons: [generated] } }
    }
    return { data: [Array(1024).fill(0.1)] }
  }) as Ai['run']
  try {
    sqlite.prepare('INSERT INTO sources(repo, cursor) VALUES(?,?)').run(sample.repo, oldSha)
    await assert.rejects(syncSource(env, sample.repo), /inference/)
    assert.equal(sqlite.prepare('SELECT cursor FROM sources').get()!.cursor, oldSha)
    assert.equal(sqlite.prepare('SELECT lease_until FROM sources').get()!.lease_until, 0)
    assert.equal((await allLessons(env)).length, 0)
    fail = false
    const result = await syncSource(env, sample.repo)
    assert.equal('lessons' in result ? result.lessons : 0, 1)
    assert.equal(sqlite.prepare('SELECT cursor FROM sources').get()!.cursor, nextSha)
    assert.equal(sqlite.prepare('SELECT error FROM sources').get()!.error, null)
    assert.equal((await allLessons(env))[0].slug, sample.slug)
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM sync_runs').get()!.count, 1)
    approve = false
    commit.sha = 'c'.repeat(40)
    generated.commits = [{ sha: commit.sha, note: 'Unsupported rewrite' }]
    generated.summary = 'Unsupported rewrite'
    const rejected = await syncSource(env, sample.repo)
    assert.equal('lessons' in rejected ? rejected.lessons : -1, 0)
    assert.equal((await allLessons(env))[0].summary, sample.summary)
    isPrivate = true
    await assert.rejects(syncSource(env, sample.repo), /no longer public/)
    assert.equal(sqlite.prepare('SELECT cursor FROM sources').get()!.cursor, commit.sha)
  } finally { sqlite.close() }
})
