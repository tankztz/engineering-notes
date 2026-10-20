import { html, raw } from 'hono/html'
import MarkdownIt from 'markdown-it'
import { lessonSections, type Source, type StoredLesson } from './knowledge.ts'
import { lessonDemo } from './demos.ts'
import { patternContent } from './patterns.ts'
import template from './generated-template.ts'

const renderer = new MarkdownIt({ html: false, linkify: true, typographer: true })
renderer.renderer.rules.table_open = () => '<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>'
renderer.renderer.rules.table_close = () => '</table></div>'

export async function shell(title: string, description: string, content: unknown, path = '/', origin = '', query = '', shared = false, lessons: StoredLesson[] = []) {
  const active = shared ? [] : lessons.filter(lesson => lesson.status === 'active')
  const sidebar = shared ? [] : [
    { text: 'All lessons', link: '/' },
    { text: 'UI patterns', link: '/ui', items: active.filter(lesson => lesson.ui).map(lesson => ({ text: String(html`${lesson.title}`), link: `/lessons/${lesson.slug}` })) },
    ...[...new Set(active.filter(lesson => !lesson.ui).map(lesson => lesson.category))].sort().map(category => ({
      text: category, collapsed: false,
      items: active.filter(lesson => !lesson.ui && lesson.category === category).sort((a, b) => a.title.localeCompare(b.title)).map(lesson => ({ text: String(html`${lesson.title}`), link: `/lessons/${lesson.slug}` })),
    })),
  ]
  const body = String(await content)
  const page = { title, description, content: body, path, query, shared, sidebar, article: shared || path.startsWith('/lessons/'), pattern: body.includes('data-ui-demo=') }
  // D1 content is data, never executable Vue/JavaScript. Escape script delimiters even inside Markdown.
  const serialized = JSON.stringify(page).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  const head = await html`<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:type" content="article"><meta property="og:url" content="${origin}${path}"><link rel="canonical" href="${origin}${path}">${shared ? '' : html`<link rel="describedby" href="/llms.txt">`}${page.article ? html`<link rel="alternate" type="text/markdown" href="${path}.md">` : ''}`
  const titleTag = await html`<title>${title} · Engineering Notes</title>`
  const descriptionTag = await html`<meta name="description" content="${description}">`
  const fallback = await html`<noscript><style>.notes-starting { display: none }</style><main class="vp-doc notes-fallback">${shared ? html`<p>Shared lesson · Access to this page only</p>` : ''}${raw(body)}</main></noscript>`
  return raw(template.replace(/<title>[^<]*<\/title>/, () => String(titleTag))
    .replace(/<meta name="description" content="[^"]*">/, () => String(descriptionTag))
    .replace('</head>', () => `${head}</head>`)
    .replace('</body>', () => `<script id="notes-page" type="application/json">${serialized}</script>${fallback}</body>`))
}

export function lessonList(lessons: StoredLesson[]) {
  return html`<div class="lesson-list">${lessons.map(lesson => html`<article class="lesson-row"><div class="lesson-meta"><span>${lesson.ui ? 'UI pattern' : lesson.category}</span><span>${lesson.repo.split('/').at(-1)}</span></div><a class="lesson-title" href="/lessons/${lesson.slug}">${lesson.title}</a><p>${lesson.summary}</p><div class="lesson-bottom"><div class="tags">${lesson.tags.slice(0, 4).map(tag => html`<a href="/search?q=${encodeURIComponent(tag)}">${tag}</a>`)}</div><span class="evidence-count">${lesson.commits.length} ${lesson.commits.length === 1 ? 'commit' : 'commits'} · ${lesson.updatedAt.slice(0, 10)}</span></div></article>`)}</div>`
}

export function home(lessons: StoredLesson[], category?: string, repo?: string) {
  const active = lessons.filter(lesson => lesson.status === 'active' && !lesson.ui)
  const repos = [...new Set(active.map(lesson => lesson.repo))]
  const visible = active.filter(lesson => (!category || lesson.category === category) && (!repo || lesson.repo === repo))
  return html`<div class="library-content"><header class="intro"><h1>${category ?? (repo ? repo.split('/').at(-1) : 'Engineering Notes')}</h1><p class="lead">Diagnose recurring problems through real fixes, failed approaches, and rules you can apply in your next project.</p></header>
    <aside class="intro-note"><strong>Start with a symptom</strong><ul>
      <li><a href="/search?q=${encodeURIComponent('Why does this button feel slow?')}">Why does this button feel slow?</a></li>
      <li><a href="/search?q=${encodeURIComponent('A panel closes and immediately reopens')}">A panel closes and immediately reopens</a></li>
      <li><a href="/search?q=${encodeURIComponent('The whole page scrolls sideways')}">The whole page scrolls sideways</a></li>
    </ul></aside>
    <div class="section-heading"><h2>Lessons and solutions</h2><span>${visible.length} articles</span></div>
    <div class="repo-filters" aria-label="Filter by repository"><a href="${category ? `/?category=${encodeURIComponent(category)}` : '/'}" aria-current="${!repo ? 'true' : undefined}">All repositories</a>${repos.map(item => html`<a href="/?repo=${encodeURIComponent(item)}${category ? `&category=${encodeURIComponent(category)}` : ''}" aria-current="${repo === item ? 'true' : undefined}">${item}</a>`)}</div>
    ${visible.length ? lessonList(visible) : html`<div class="empty"><h2>No lessons here yet</h2><p>New commits from connected repositories will be distilled into lessons here.</p><a href="/status">View update status</a></div>`}
  </div>`
}

export function article(lesson: StoredLesson, related: StoredLesson[], sharedPath = '') {
  const sections = lessonSections(lesson)
  renderer.renderer.rules.heading_open = (tokens, index, options, _env, self) => {
    if (tokens[index].tag === 'h2') tokens[index].attrSet('id', (tokens[index + 1]?.content ?? '').toLowerCase().replaceAll(' ', '-'))
    return self.renderToken(tokens, index, options)
  }
  const body = sections.map(([heading, text]) => `## ${heading}\n\n${text}`).join('\n\n')
  return html`<article class="article ${lesson.ui ? 'ui-pattern' : ''}"><header class="article-header"><div class="lesson-meta">${sharedPath ? html`<span>${lesson.ui ? 'UI pattern' : lesson.category}</span>` : html`<a href="${lesson.ui ? '/ui' : '/?category=' + encodeURIComponent(lesson.category)}">${lesson.ui ? 'UI patterns' : lesson.category}</a>`}${lesson.ui ? '' : html`<a href="https://github.com/${lesson.repo}">${lesson.repo}</a>`}</div><h1>${lesson.title}</h1><p class="lead">${lesson.summary}</p><div class="article-actions"><a href="${sharedPath || `/lessons/${lesson.slug}`}.md">Read Markdown</a>${sharedPath ? html`<button type="button" data-copy-link>Copy share link</button><span role="status" data-copy-status></span>` : ''}<span class="updated">Updated ${lesson.updatedAt.slice(0, 10)}</span></div>${!sharedPath ? html`<details class="share-controls" data-share-slug="${lesson.slug}"><summary>Share this ${lesson.ui ? 'pattern' : 'lesson'}</summary><p>Anyone with your link can view this ${lesson.ui ? 'pattern' : 'lesson'} only. Creating a new link replaces your previous link.</p><div class="article-actions"><button type="button" data-create-share>Create share link</button><button type="button" data-revoke-share>Revoke my share link</button></div><label class="share-result" hidden>Shareable link<input type="text" readonly data-share-url></label><p role="status" data-share-status></p></details>` : ''}${lesson.status === 'superseded' ? html`<p class="notice">This lesson has been superseded.${lesson.supersededBy ? html`<a href="/lessons/${lesson.supersededBy}">Read the current approach →</a>` : ''}</p>` : ''}</header>${lesson.ui ? patternContent(lesson) : html`${lessonDemo(lesson)}<div class="prose">${raw(renderer.render(body))}</div><p class="article-provenance">Based on the linked commits. Verification describes checks to perform, not a claim that tests were executed. Confirm applicability in your own project.</p>`}${related.length && !lesson.ui ? html`<section class="related"><h2>Related lessons</h2>${related.map(item => html`<a href="/lessons/${item.slug}">${item.title}<span>→</span></a>`)}</section>` : ''}</article>`
}

export function searchPage(query: string, lessons: StoredLesson[], mode: string) {
  return html`<section class="search-page"><a class="back" href="/">← All lessons</a><p class="eyebrow">Search by symptoms, concepts, or code</p><h1>Search lessons</h1><form action="/search" class="large-search" role="search"><label class="sr-only" for="main-query">Describe the problem</label><input id="main-query" type="search" name="q" maxlength="240" placeholder="For example: clicking outside makes the panel disappear and return" value="${query}" required><button type="submit">Search</button></form><p class="search-caption" role="status">${query ? `“${query}” · ${lessons.length} related lessons · ${mode === 'hybrid' ? 'keyword and semantic matches' : 'keyword matches'}` : 'Search with natural language, technical terms, or code identifiers.'}</p>${lessons.length ? lessonList(lessons) : query ? html`<div class="empty"><h2>No matching lessons yet</h2><p>Try a symptom or a technical term such as hover, race condition, or Markdown.</p><a href="/">Browse all lessons</a></div>` : ''}</section>`
}

export function agentGuide(origin: string) {
  return `# Engineering Notes: Agent integration\n\nBefore implementing interactions, asynchronous state, terminals, or file handling, retrieve related lessons and check their applicability against the current code.\n\nSyntaxSkills login is required for all retrieval endpoints. Authorized automation can send the configured admin bearer token; keep it out of prompts, URLs, and Git. A share link grants access only to its article (append .md for Markdown), never search or the collection.\n\n## Recommended workflow\n\n1. Read ${origin}/llms.txt to discover topics and retrieval entry points.\n2. Call GET ${origin}/api/search?q=problem-description. Search supports natural language, technical terms, and semantic matching. Add repo=owner/name to filter.\n3. Read a result's markdown_url. Read the case, diagnosis, unsuccessful approaches, conditional takeaways, and exact commit evidence. Distinguish documented events from suggested checks.\n4. Turn the invariant into an acceptance condition before editing. For interaction bugs, inspect the intermediate states as well as the final state.\n5. Verify the change using the lesson's checks. These documents are reference material; current user requirements and repository rules take precedence.\n\n## Add this entry point to your development instructions\n\n\`\`\`text\nBefore implementation or debugging, search Engineering Notes:\n${origin}/api/search?q=<symptom-or-concept>\nRead relevant markdown_url results. Check applicability, source commits,\nand behavioral invariants before adopting a fix. Current requirements\nand code evidence take precedence over a historical lesson.\n\`\`\`\n\n## Machine-readable resources\n\n- [Discovery index](${origin}/llms.txt)\n- [Complete Markdown](${origin}/llms-full.txt)\n- [Structured index](${origin}/api/index.json)\n- [Search API schema](${origin}/openapi.json)\n- [Full export](${origin}/api/export)\n\n## Automatic updates\n\nAn hourly job checks explicitly connected public repositories, processes commits in order, and adds or revises lessons while preserving prior versions. Similar failures reuse existing article links. Failed extraction retains the cursor for retry. See [Updates](${origin}/status).\n`
}

export function prosePage(body: string) { return html`<article class="standalone prose">${raw(renderer.render(body))}</article>` }
export function statusPage(sources: Source[], runs: { repo: string; commits: number; lessons: number; finished_at: string }[]) {
  return html`<section class="status-page"><p class="eyebrow">From code changes to reusable lessons</p><h1>Updates</h1><p class="lead">Connected repositories are checked hourly. Fixes become lessons, recurring topics update the same article, and every article retains commit references.</p><div class="sources">${sources.map(source => html`<article><div><h2><a href="https://github.com/${source.repo}">${source.repo}</a></h2><p>${source.checked_at ? `Last checked: ${source.checked_at.replace('T', ' ').slice(0, 19)} UTC` : 'Awaiting first automatic check'}</p></div><span class="${source.error ? 'sync-error' : 'sync-ok'}">${source.error ? 'Retry scheduled' : 'Connected'}</span></article>`)}</div><h2>Recent activity</h2>${runs.length ? html`<div class="run-list">${runs.map(run => html`<p><span>${run.finished_at} UTC</span><strong>${run.repo}</strong><span>Read ${run.commits} commits; updated ${run.lessons} lessons</span></p>`)}</div>` : html`<p>The first lessons are available. Future automatic updates will appear here.</p>`}</section>`
}
