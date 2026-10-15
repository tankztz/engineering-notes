import { html } from 'hono/html'
import type { StoredLesson } from './knowledge.ts'

// Illustrations are reviewed UI code, never executable content from a stored lesson.
export const lessonDemos: Record<string, string> = {
  'muxmap-terminal-readiness': 'readiness',
  'muxmap-hover-expansion-stability': 'hover',
  'muxmap-preserve-selection-on-outside-click': 'selection',
  'muxmap-markdown-table-overflow': 'overflow',
  'muxmap-exclude-archived-branches-from-file-preview-links': 'visibility',
  'muxmap-codex-permission-notification-delay': 'notifications',
  'mobile-input-focus-zoom': 'zoom',
}

export function lessonDemo(lesson: StoredLesson) {
  const kind = Object.hasOwn(lessonDemos, lesson.slug) ? lessonDemos[lesson.slug] : undefined
  return html`<section class="lesson-demo" aria-labelledby="try-it"><h2 id="try-it">${kind ? 'Try it: problem and fix' : 'Try it: reason through the fix'}</h2>
    ${kind ? html`<p class="demo-intro">An interactive illustration of the mechanism. Sample data and timing are for learning, not a replay or benchmark of the source application.</p><div data-lesson-demo="${kind}"><p>Enable JavaScript to run the example. The explanation and verification steps below also work without it.</p></div>` : html`<p class="demo-intro">Start with this symptom: ${lesson.triggers[0]} What would you inspect first? Make a prediction, then reveal each part of the case.</p><details><summary>1. Reveal the diagnosis</summary><p>${lesson.cause}</p></details><details><summary>2. Compare the previous approach</summary><p>${lesson.attempts ?? 'The cited evidence does not document unsuccessful attempts.'}</p></details><details><summary>3. Reveal the improvement</summary><p>${lesson.solution}</p></details><details><summary>4. Plan a check</summary><p>${lesson.verification}</p></details>`}
  </section>`
}
