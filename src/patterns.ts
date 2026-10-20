import { html } from 'hono/html'
import type { StoredLesson } from './knowledge.ts'

export function patternContent(lesson: StoredLesson) {
  const ui = lesson.ui!
  return html`<section class="pattern-preview" aria-labelledby="sample"><h2 id="sample">Interactive sample</h2><p class="pattern-caption">Try the welcome screen, then turn the cover letter. All content here is fictional.</p><div data-ui-demo="${ui.demo}"><p>Enable JavaScript to interact with the sample. The sources and prompt remain available below.</p></div></section>
    <section class="pattern-prompt" aria-labelledby="prompt"><div class="pattern-section-heading"><h2 id="prompt">Prompt</h2><button type="button" data-copy-prompt>Copy prompt</button></div><p class="pattern-caption">Paste into your coding agent. Includes instructions for Impeccable when available.</p><textarea id="pattern-prompt" aria-label="Reusable UI prompt" readonly rows="12">${ui.prompt}</textarea><p class="pattern-copy-status" data-prompt-status role="status"></p></section>
    <section class="pattern-sources" aria-labelledby="source"><h2 id="source">Source</h2>${ui.sources.map(source => html`<div class="pattern-source"><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a><p>${source.note}</p></div>`)}</section>`
}

export function patternLibrary(lessons: StoredLesson[]) {
  const patterns = lessons.filter(lesson => lesson.ui && lesson.status === 'active')
  return html`<section class="pattern-library"><h1>UI patterns</h1><p class="lead">Explore a working sample. Copy the prompt. Make it your own.</p>${patterns.length ? html`<div class="pattern-list">${patterns.map(lesson => html`<a class="pattern-card" href="/lessons/${lesson.slug}"><div class="pattern-thumbnail" aria-hidden="true"><div class="thumbnail-paper"><span></span><span></span><span></span><i></i></div></div><div><h2>${lesson.title}</h2><p>${lesson.summary}</p><span class="pattern-open">Explore pattern →</span></div></a>`)}</div>` : html`<p>No UI patterns yet.</p>`}</section>`
}
