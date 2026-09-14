import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lessonSchema, markdown } from '../src/knowledge.ts'

const base = process.env.NOTES_URL
const token = process.env.NOTES_ADMIN_TOKEN
const command = process.argv[2]
if (!base) throw new Error('Set NOTES_URL to the deployed site URL')
async function api(path: string, method = 'GET', body?: unknown) {
  if (path.startsWith('/api/admin/') && !token) throw new Error('Set NOTES_ADMIN_TOKEN for management commands')
  const response = await fetch(new URL(path, base), { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
  return response.json()
}
if (command === 'seed') {
  const lessons = readdirSync('content').filter(name => name.endsWith('.json')).map(name => lessonSchema.parse(JSON.parse(readFileSync(`content/${name}`, 'utf8'))))
  console.log(await api('/api/admin/lessons', 'PUT', lessons))
} else if (command === 'source') {
  const repo = process.argv[3]
  if (!repo) throw new Error('Usage: npm run source -- owner/repo [initial-commit-sha]')
  console.log(await api('/api/admin/sources', 'PUT', { repo, ...(process.argv[4] ? { cursor: process.argv[4] } : {}) }))
} else if (command === 'sync') {
  console.log(await api('/api/admin/sync', 'POST', process.argv[3] ? { repo: process.argv[3] } : {}))
} else if (command === 'export') {
  const result = await api('/api/export') as { lessons: unknown[] }
  const directory = resolve(process.argv[3] ?? 'exports')
  mkdirSync(directory, { recursive: true })
  for (const input of result.lessons) {
    const lesson = lessonSchema.parse(Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key]) => !['updatedAt', 'markdown'].includes(key))))
    writeFileSync(resolve(directory, `${lesson.slug}.md`), markdown(lesson))
  }
  console.log(`Exported ${result.lessons.length} Markdown files to ${directory}`)
} else throw new Error('Commands: source, seed, sync, export')
