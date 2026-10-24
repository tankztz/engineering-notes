import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { URL } from 'node:url'
import { hashToken } from '../src/access.ts'
import { lessonDemos } from '../src/demos.ts'
import template from '../src/generated-template.ts'
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
  assert.equal(seeds.length, 5)
  for (const lesson of seeds) {
    const md = markdown(lesson)
    for (const heading of ['When to use this lesson', 'What happened', 'Diagnosis and approach', 'What did not work', 'What changed', 'How to verify the improvement', 'What to do next time', 'Limits and exceptions', 'Commit evidence']) assert.ok(md.includes(`## ${heading}`))
    assert.doesNotMatch(md, /\p{Script=Han}/u)
    assert.ok(lesson.commits.every(commit => md.includes(`/commit/${commit.sha}`)))
  }
  assert.throws(() => lessonSchema.parse({ ...sample, title: '\u4e2d\u6587' }), /English/)
  assert.throws(() => lessonSchema.parse({ ...sample, commits: [{ sha: '1234567', note: 'Short SHA' }] }))
  const { attempts: _attempts, ...legacy } = sample
  assert.match(markdown(lessonSchema.parse(legacy)), /does not document unsuccessful attempts/)
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

test('anonymous readers can browse, search and export without the login service', async t => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Login service must not be called for public reading') })
  try {
    await saveLessons(env, seeds)
    const paths = ['/', '/ui', '/search?q=hover', '/api/search?q=hover', '/api/index.json', '/api/export', '/llms.txt', '/llms-full.txt', '/agents', '/agents.md', '/openapi.json', '/sitemap.xml', '/health', `/lessons/${sample.slug}`, `/lessons/${sample.slug}.md`]
    for (const path of paths) {
      for (const headers of [new Headers(), new Headers({ cookie: `__Host-notes-session=${'x'.repeat(43)}` })]) {
        const response = await app.request(path, { headers }, env)
        assert.equal(response.status, 200, path)
        assert.equal(response.headers.get('location'), null, path)
        assert.equal(response.headers.get('x-robots-tag'), null, path)
      }
    }
    const md = await app.request(`/lessons/${sample.slug}`, { headers: { accept: 'text/markdown' } }, env)
    assert.equal(await md.text(), markdown(sample))
    const head = await app.request(`/lessons/${sample.slug}`, { method: 'HEAD' }, env)
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    for (const [path, method] of [['/api/admin/lessons', 'PUT'], ['/api/admin/sync', 'POST'], ['/api/admin/reindex', 'POST'], ['/api/admin/sources', 'PUT'], ['/api/admin/status', 'GET'], [`/api/lessons/${sample.slug}/share`, 'POST'], [`/api/lessons/${sample.slug}/share`, 'DELETE']]) {
      assert.equal((await app.request(path, { method, headers: { origin: 'http://localhost' } }, env)).status, 401, path)
    }
    assert.equal((await app.request('/status', {}, env)).status, 302)
    assert.equal((await app.request('/api/export', { method: 'POST' }, env)).status, 401)
    const robots = await (await app.request('/robots.txt', {}, env)).text()
    assert.match(robots, /Allow: \/\n/)
    assert.match(robots, /Disallow: \/api\/admin\//)
    assert.doesNotMatch(robots, /Disallow: \/\n/)
    const guide = await (await app.request('/agents.md', {}, env)).text()
    assert.match(guide, /No login or token is needed to read/)
    const article = await (await app.request(`/lessons/${sample.slug}`, {}, env)).text()
    assert.match(article, /Copy link/)
    assert.doesNotMatch(article, /data-share-slug|data-create-share/)
  } finally { sqlite.close() }
})

test('VitePress receives current D1 content as inert page data, with no lessons in static assets', async () => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  const title = 'Escaping </script><script>alert(1)</script> & {{ 7 * 7 }}'
  const lesson = { ...sample, slug: 'runtime-only-lesson', title }
  try {
    await saveLessons(env, [lesson])
    const response = await app.request(`/lessons/${lesson.slug}`, { headers: { authorization: 'Bearer test-secret' } }, env)
    const document = await response.text()
    assert.match(document, /name="generator" content="VitePress v1\.6\.4"/)
    const encoded = document.match(/<script id="notes-page" type="application\/json">([\s\S]*?)<\/script>/)![1]
    assert.doesNotMatch(encoded, /[<>]/)
    const page = JSON.parse(encoded)
    assert.equal(page.title, title)
    assert.ok(page.content.includes('&lt;/script&gt;'))
    assert.ok(page.content.includes('{{ 7 * 7 }}'))
    assert.doesNotMatch(document, /<script>alert/)
    const nav = page.sidebar.flatMap((group: { items?: { text: string }[] }) => group.items ?? [])
    assert.ok(nav.some((item: { text: string }) => item.text.includes('&lt;/script&gt;')))
    await saveLessons(env, [{ ...lesson, summary: 'Updated after the VitePress build.' }])
    assert.match(await (await app.request(`/lessons/${lesson.slug}`, { headers: { authorization: 'Bearer test-secret' } }, env)).text(), /Updated after the VitePress build/)
    assert.doesNotMatch(template, /notes-page|runtime-only-lesson/)
    const assets = new URL('../docs/.vitepress/dist/assets/', import.meta.url)
    for (const file of readdirSync(assets, { recursive: true }).filter(file => /\.(js|css)$/.test(String(file)))) {
      const data = readFileSync(new URL(String(file), assets), 'utf8')
      for (const seed of seeds) assert.ok(!data.includes(seed.title), `Private title in static asset: ${file}`)
      assert.ok(!data.includes('test-secret'))
    }
  } finally { sqlite.close() }
})

test('every curated example is served only inside its article and new topics get a safe live exercise', async () => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  const headers = { authorization: 'Bearer test-secret' }
  try {
    await saveLessons(env, Object.keys(lessonDemos).map(slug => ({ ...sample, slug })))
    for (const [slug, kind] of Object.entries(lessonDemos)) {
      const response = await app.request(`/lessons/${slug}`, { headers }, env)
      const document = await response.text()
      const page = JSON.parse(document.match(/<script id="notes-page" type="application\/json">([\s\S]*?)<\/script>/)![1])
      assert.ok(page.content.includes(`data-lesson-demo="${kind}"`), slug)
      assert.equal((page.content.match(/data-lesson-demo=/g) ?? []).length, 1)
      assert.ok(page.content.includes('not a replay or benchmark'))
      const guest = await app.request(`/lessons/${slug}`, {}, env)
      assert.equal(guest.status, 200)
      assert.match(await guest.text(), /data-lesson-demo/)
    }
    const added = { ...sample, slug: 'new-topic', cause: '<script>alert(1)</script>', solution: 'New solution from current D1.' }
    await saveLessons(env, [added])
    const document = await (await app.request('/lessons/new-topic', { headers }, env)).text()
    const page = JSON.parse(document.match(/<script id="notes-page" type="application\/json">([\s\S]*?)<\/script>/)![1])
    assert.match(page.content, /Try it: reason through the fix/)
    assert.match(page.content, /&lt;script&gt;alert/)
    assert.match(page.content, /New solution from current D1/)
    assert.doesNotMatch(page.content, /data-lesson-demo|<script>/)
    assert.equal((page.content.match(/<summary>[1-4]\./g) ?? []).length, 4)
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

test('UI patterns retain structured prompts, safe sources, curated samples and revocable sharing', async () => {
  const { sqlite, DB } = database()
  const env = environment(DB)
  const headers = { authorization: 'Bearer test-secret' }
  const pattern = lessonSchema.parse({ ...sample, slug: 'ui-pattern-test', title: 'A reusable UI',
    ui: {
      sources: [{ label: 'Design reference', url: 'https://example.com/design', note: 'Inspiration, not an application template.' }],
      prompt: 'Use Impeccable. Render </textarea><script>alert(1)</script> as text.',
      demo: 'monochrome-paper',
    },
  })
  const pageData = (document: string) => JSON.parse(document.match(/<script id="notes-page" type="application\/json">([\s\S]*?)<\/script>/)![1])
  try {
    assert.throws(() => lessonSchema.parse({ ...pattern, ui: { ...pattern.ui, demo: '<script>' } }))
    assert.throws(() => lessonSchema.parse({ ...pattern, ui: { ...pattern.ui, sources: [{ label: 'Unsafe', url: 'javascript:alert(1)', note: 'Bad link' }] } }))
    await saveLessons(env, [{ ...sample, slug: pattern.slug }])
    await saveLessons(env, [pattern])
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM revisions WHERE slug=?').get(pattern.slug)!.count, 1)
    const document = await (await app.request(`/lessons/${pattern.slug}`, { headers }, env)).text()
    const page = pageData(document)
    assert.equal(page.pattern, true)
    assert.match(page.content, /data-ui-demo="monochrome-paper"/)
    assert.match(page.content, /Copy prompt|Design reference/)
    assert.match(page.content, /&lt;\/textarea&gt;&lt;script&gt;/)
    assert.doesNotMatch(page.content, /Try it:|What happened|data-lesson-demo|<script>/)
    const md = markdown(pattern)
    assert.match(md, /## Source[\s\S]*## Prompt[\s\S]*## Interactive sample/)
    assert.doesNotMatch(md, /## What happened/)
    const gallery = pageData(await (await app.request('/ui', { headers }, env)).text())
    assert.match(gallery.content, /A reusable UI/)
    assert.equal((await app.request('/ui', {}, env)).status, 200)
    assert.equal((await searchLessons(env, 'Impeccable')).results[0].slug, pattern.slug)
    const response = await app.request(`/api/lessons/${pattern.slug}/share`, { method: 'POST', headers }, env)
    assert.equal(response.status, 201)
    const share = new URL((await response.json() as { url: string }).url).pathname
    const shared = pageData(await (await app.request(share, {}, env)).text())
    assert.equal(shared.shared, true)
    assert.deepEqual(shared.sidebar, [])
    assert.match(shared.content, /data-ui-demo="monochrome-paper"/)
    assert.doesNotMatch(shared.content, /href="\/ui"|data-share-slug/)
    const sharedMarkdown = await (await app.request(share + '.md', {}, env)).text()
    assert.equal(sharedMarkdown, md)
    await app.request(`/api/lessons/${pattern.slug}/share`, { method: 'DELETE', headers }, env)
    assert.equal((await app.request(share, {}, env)).status, 404)
  } finally { sqlite.close() }
})

test('SyntaxSkills login protects operational status and legacy share management', async t => {
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
  const privatePaths = ['/status']
  try {
    await saveLessons(env, seeds)
    for (const path of privatePaths) {
      const response = await request(path)
      assert.ok([302, 401].includes(response.status), path)
      assert.match(response.headers.get('cache-control')!, /no-store/)
      assert.ok(!(await response.text()).includes(sample.title), path)
    }
    assert.equal((await request(`/api/lessons/${sample.slug}/share`, { method: 'POST' })).status, 401)
    assert.equal((await request('/api/export', { headers: { cookie: '__Host-notes-session=forged' } })).status, 200)
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
      assert.equal(response.headers.get('referrer-policy'), 'same-origin')
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
    const sharedPage = JSON.parse(sharedHtml.match(/<script id="notes-page" type="application\/json">([\s\S]*?)<\/script>/)![1])
    assert.deepEqual(sharedPage.sidebar, [])
    assert.equal(sharedPage.shared, true)
    assert.match(sharedPage.content, /data-lesson-demo="hover"/)
    assert.match(sharedHtml, /Access to this page only/)
    assert.ok(sharedHtml.includes(sample.title))
    assert.ok(sharedHtml.includes(`${shared.pathname}.md`))
    assert.doesNotMatch(sharedHtml, /Related lessons|header-search|data-share-slug|JSON index|All lessons/)
    for (const lesson of seeds.filter(lesson => lesson.slug !== sample.slug)) assert.ok(!sharedHtml.includes(lesson.title))
    assert.equal(await (await request(shared.pathname + '.md')).text(), markdown(sample))
    assert.equal(await (await request(shared.pathname, { headers: { accept: 'text/markdown' } })).text(), markdown(sample))
    assert.equal(authCalls, callsBeforeShare)
    const otherSlug = seeds.find(lesson => lesson.slug !== sample.slug)!.slug
    for (const path of [...privatePaths, '/api/admin/status']) {
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
    assert.equal((await request(sharePath, { method: 'DELETE', headers: signed })).status, 401)
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
  const { attempts: _attempts, ...missingHistory } = updated
  assert.throws(() => validateExtraction({ lessons: [missingHistory] }, sample.repo, [commit], [sample]), /attempts/)
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
      if (model === '@cf/openai/gpt-oss-120b') return { response: { reviews: [{ slug: generated.slug, unsupportedClaims: approve ? [] : ['The new patch does not support this rewrite.'], approved: true }] } }
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
