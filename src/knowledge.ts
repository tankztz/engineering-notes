import { z } from 'zod'

export const repository = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
export const commitSha = z.string().regex(/^[a-f0-9]{40}$/)
const text = z.string().trim().min(1).max(12000)
export const lessonSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64),
  title: text.max(140), summary: text.max(500), repo: repository,
  category: z.enum(['Interaction stability', 'Async and state', 'Terminals and processes', 'Content and files', 'Engineering practice']),
  tags: z.array(text.max(60)).min(1).max(12),
  triggers: z.array(text.max(180)).min(1).max(8),
  invariant: text, symptom: text, cause: text, solution: text, verification: text, limitations: text,
  attempts: text.optional(),
  commits: z.array(z.object({ sha: commitSha, note: text.max(300) })).min(1).max(60),
  status: z.enum(['active', 'superseded']).default('active'),
  supersededBy: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  related: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(8).default([]),
  ui: z.object({
    sources: z.array(z.object({ label: text.max(120), url: z.string().url().startsWith('https://'), note: text.max(500) }).strict()).min(1).max(6),
    prompt: text,
    demo: z.enum(['monochrome-paper']),
  }).strict().optional(),
}).strict().refine(lesson => !/\p{Script=Han}/u.test(JSON.stringify(lesson)), 'All lesson content must be in English')
export type Lesson = z.infer<typeof lessonSchema>
export type StoredLesson = Lesson & { updatedAt: string }
export type Env = { DB: D1Database; AI: Ai; LESSONS: VectorizeIndex; ASSETS: Fetcher; ADMIN_TOKEN: string; SITE_URL?: string; GITHUB_TOKEN?: string }
export type Source = { repo: string; branch: string; cursor: string; checked_at: string | null; error: string | null }
export const EMBEDDING_MODEL = '@cf/baai/bge-m3'
export const GENERATION_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'

export function lessonSections(lesson: Lesson) {
  if (lesson.ui) return [
    ['Source', lesson.ui.sources.map(source => `- [${source.label}](${source.url}): ${source.note}`).join('\n')],
    ['Prompt', lesson.ui.prompt],
    ['Interactive sample', 'Open the browser version of this page to explore the sample. It uses fictional content, with mouse, touch and keyboard controls.'],
  ]
  return [
    ['When to use this lesson', lesson.triggers.map(t => `- ${t}`).join('\n')],
    ['What happened', lesson.symptom],
    ['Diagnosis and approach', lesson.cause],
    ['What did not work', lesson.attempts ?? 'The cited evidence does not document unsuccessful attempts.'],
    ['What changed', lesson.solution],
    ['How to verify the improvement', lesson.verification],
    ['What to do next time', lesson.invariant],
    ['Limits and exceptions', lesson.limitations],
    ['Commit evidence', lesson.commits.map(c => `- [${lesson.repo}@${c.sha.slice(0, 7)}](https://github.com/${lesson.repo}/commit/${c.sha}): ${c.note}`).join('\n')],
  ]
}

export function markdown(lesson: Lesson) {
  return `# ${lesson.title}\n\n> ${lesson.summary}\n\nRepository: ${lesson.repo} · Category: ${lesson.category} · Status: ${lesson.status === 'active' ? 'Active' : 'Superseded'}\n\nKeywords: ${lesson.tags.join(', ')}\n\n${lessonSections(lesson).map(([heading, body]) => `## ${heading}\n\n${body}`).join('\n\n')}\n${lesson.supersededBy ? `\nReplacement lesson: [${lesson.supersededBy}](/lessons/${lesson.supersededBy}.md)\n` : ''}`
}

export function searchText(lesson: Lesson) {
  return [lesson.title, lesson.summary, ...lesson.tags, ...lesson.triggers, lesson.invariant, lesson.symptom, lesson.cause, lesson.attempts, lesson.solution, lesson.verification, lesson.limitations, lesson.ui?.prompt, ...lesson.ui?.sources.map(source => `${source.label} ${source.note}`) ?? []].filter(Boolean).join('\n')
}

export function searchTokens(query: string) {
  return [...new Set([...new Intl.Segmenter('zh', { granularity: 'word' }).segment(query.toLowerCase())].filter(part => part.isWordLike).map(part => part.segment))].slice(0, 16)
}

export function ftsQuery(query: string) {
  return searchTokens(query).map(token => `"${token.replaceAll('"', '""')}"`).join(' OR ')
}

export async function getLesson(env: Env, slug: string): Promise<StoredLesson | null> {
  const row = await env.DB.prepare('SELECT document, updated_at FROM lessons WHERE slug = ?').bind(slug).first<{ document: string; updated_at: string }>()
  return row ? { ...JSON.parse(row.document), updatedAt: row.updated_at } : null
}

export async function allLessons(env: Env): Promise<StoredLesson[]> {
  const { results } = await env.DB.prepare('SELECT document, updated_at FROM lessons ORDER BY updated_at DESC, slug').all<{ document: string; updated_at: string }>()
  return results.map(row => ({ ...JSON.parse(row.document), updatedAt: row.updated_at }))
}

export async function indexLesson(env: Env, lesson: Lesson) {
  // Embed the failure pattern; long procedural sections dilute symptom similarity.
  const document = [lesson.title, lesson.summary, ...lesson.tags, ...lesson.triggers, lesson.symptom, lesson.cause].join('\n')
  const embedded = await env.AI.run(EMBEDDING_MODEL, { text: [document.slice(0, 18000)] }) as { data: number[][] }
  if (embedded.data?.[0]?.length !== 1024) throw new Error('Invalid embedding response')
  await env.LESSONS.upsert([{ id: lesson.slug, values: embedded.data[0], metadata: { repo: lesson.repo, status: lesson.status } }])
}

export async function saveLessons(env: Env, lessons: Lesson[]) {
  // Index before the atomic DB write: failed AI/index calls leave published documents unchanged.
  for (const lesson of lessons) await indexLesson(env, lesson)
  const statements = lessons.flatMap(lesson => [
    env.DB.prepare('INSERT INTO revisions(slug, document) SELECT slug, document FROM lessons WHERE slug = ? AND document != ?').bind(lesson.slug, JSON.stringify(lesson)),
    env.DB.prepare(`INSERT INTO lessons(slug,title,summary,repo,category,status,document,search_text,updated_at) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(slug) DO UPDATE SET title=excluded.title,summary=excluded.summary,repo=excluded.repo,category=excluded.category,status=excluded.status,document=excluded.document,search_text=excluded.search_text,updated_at=excluded.updated_at`).bind(lesson.slug, lesson.title, lesson.summary, lesson.repo, lesson.category, lesson.status, JSON.stringify(lesson), searchText(lesson), new Date().toISOString()),
  ])
  if (statements.length) await env.DB.batch(statements)
}

export async function searchLessons(env: Env, query: string, repo?: string) {
  const tokens = searchTokens(query)
  if (!tokens.length) return { results: [], mode: 'keyword' as const }
  const fts = await env.DB.prepare(`SELECT lessons_fts.slug FROM lessons_fts JOIN lessons ON lessons.slug = lessons_fts.slug
    WHERE lessons_fts MATCH ? AND lessons.status = 'active' AND (? IS NULL OR lessons.repo = ?)
    ORDER BY bm25(lessons_fts, 0, 6, 3, 1) LIMIT 30`).bind(ftsQuery(query), repo ?? null, repo ?? null).all<{ slug: string }>()
  let semantic: { id: string; score: number }[] = []
  let mode: 'hybrid' | 'keyword' = 'keyword'
  try {
    const embedded = await env.AI.run(EMBEDDING_MODEL, { text: [query] }) as { data: number[][] }
    const matches = await env.LESSONS.query(embedded.data[0], { topK: 20, returnMetadata: 'all', ...(repo ? { filter: { repo } } : {}) })
    semantic = matches.matches.filter(match => match.score >= 0.35)
    mode = 'hybrid'
  } catch { /* Native keyword search remains available when the embedding service is unavailable. */ }
  // Semantic relevance leads; a small keyword bonus breaks close ties. Do not
  // count substring matches twice or let common words dominate natural-language queries.
  const scores = new Map(semantic.map(match => [match.id, match.score]))
  fts.results.forEach(({ slug }, rank) => scores.set(slug, (scores.get(slug) ?? 0) + 0.01 / (rank + 1)))
  const ranked = [...scores].sort((a, b) => b[1] - a[1])
  const results = (await Promise.all(ranked.map(async ([slug, score]) => {
    const lesson = await getLesson(env, slug)
    return lesson && lesson.status === 'active' && (!repo || lesson.repo === repo) ? { ...lesson, score } : null
  }))).filter((lesson): lesson is StoredLesson & { score: number } => lesson !== null).slice(0, 12)
  return { results, mode }
}
