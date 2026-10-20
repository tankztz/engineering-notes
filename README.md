# Engineering Notes

[Open the knowledge base](https://engineering-notes.tianzezhao.com) · [Agent entry point](https://engineering-notes.tianzezhao.com/llms.txt)

An English-only, searchable knowledge base distilled from real repository fixes. Lessons start with recognizable problems, then explain the source incident, diagnosis, unsuccessful approaches, improvements, verification, and rules for the next project. Exact source commits remain attached to the case study.

The site serves HTML, Markdown, JSON, and `llms.txt` from the same documents. Search combines SQLite FTS5 with multilingual semantic retrieval. Related lessons connect recurring concepts across repositories.

The interface runs VitePress 1.6.4 with its default documentation theme, topic sidebar, article outline, mobile navigation, and persistent light/dark appearance. The Worker checks access and supplies the current D1 page as escaped JSON. VitePress renders that content through its runtime route API. Cross-page links use full document navigation so every visit rechecks access and reads the latest revision; new lessons need no frontend rebuild. Markdown and a no-JavaScript reading fallback remain available.

Every lesson has a **Try it** section. The seven current topics have interactive problem/fix illustrations with reset controls, visible state, and keyboard/touch controls. These use sample data and simulated timing; they do not execute terminal commands, send notifications, or reproduce native iPhone behavior. Shared article links include the same example. New topics automatically get a step-by-step reveal exercise using their current D1 diagnosis, previous approach, improvement, and verification. Add a reviewed component under `docs/.vitepress/theme/demos/` and a mapping in `src/demos.ts` for a custom illustration. Stored article text is never compiled or executed as demo code.

## UI patterns

`/ui` lists visual patterns separately from engineering lessons. A document with an optional `ui` field gets a sample-first layout containing an interactive preview, a copyable prompt and source links. Its existing slug, authentication, sharing and revision history remain intact. Markdown exposes the sources and prompt without forcing a problem/fix format.

The `ui` object contains `sources` (HTTPS URLs, labels and provenance notes), `prompt`, and a reviewed `demo` identifier. The first sample, `monochrome-paper`, lives in `docs/.vitepress/theme/patterns/MonochromePaper.vue`. It uses fictional content and local state, including an access-code example and a draggable paper reveal. Source and prompt text stay in D1; stored documents cannot supply executable HTML or JavaScript. Register further sample identifiers in the schema and provide a reviewed component before publishing them. Copying a prompt falls back to selecting the text when clipboard access is unavailable.

## Editorial format

Lead with the problem a reader can recognize in another project. For example, "When a button feels slow: trace the wait" introduces a terminal-start incident without making terminal startup the entire lesson. Keep concrete implementation terms in the case and search tags.

Articles follow this sequence: when to use the lesson, what happened, diagnosis and approach, what did not work, what changed, how to verify the improvement, what to do next time, limits, and commit evidence. Takeaways should connect a condition to a diagnostic check or action. Document a failed attempt only when the evidence supports it; otherwise state that none is recorded. Distinguish proposed checks and analogous examples from historical events, and never invent timings or test results.

The optional `attempts` field keeps older stored documents readable. New extractions must supply it, including an explicit statement when unsuccessful attempts are undocumented. The generation prompt requests the same format. Evidence review lists unsupported claims and blocks those drafts before publication. Updating an existing lesson retains its slug, prior revisions, and exact commit references.

## Login and sharing

The library requires SyntaxSkills login. This includes search, discovery, Markdown, exports, status, and sitemap routes. The former Workers URL redirects to the custom domain. Authorized automation can use the existing admin bearer token; never put it in a URL, prompt, or Git.

Open a lesson and expand **Share this lesson** to create a link. Anyone with that link can read only that article, including its Markdown version. Shared pages omit collection navigation, search, and related lessons. Creating another link replaces your previous link for that lesson; **Revoke my share link** disables it immediately. Each signed-in user manages their own links. Links follow the current article at its stable slug, without granting access to other lessons or revisions.

SyntaxSkills cookies cannot cross from `syntaxskills.com` to `tianzezhao.com`. The auth service's `/api/notes-sso` endpoint bridges login with a 60-second, single-use PKCE grant and a fixed callback. Notes keeps the upstream credential in D1, issues an opaque host-only HttpOnly cookie, and revalidates the central session on protected requests. Share credentials are hashed in D1, grant no session, and work without the login service. Content responses use `no-store` and `noindex`; login and share routes also use `no-referrer`. Private pages use `same-origin` referrers so native forms retain their Origin header for CSRF checks.

## Automatic maintenance

A Cloudflare Worker checks connected public repositories hourly. It processes one commit per repository per run, oldest first, and uses Workers AI to extract up to three lessons. Semantic retrieval supplies the closest existing article. A separate model checks draft claims and citations against the patch and prior article; only approved drafts publish. Existing topics keep their URL and previous document revisions. Commits without reusable knowledge or supported drafts can produce no articles. Failed extraction, review, or indexing leaves the source cursor unchanged for retry; `/status` shows pending retries.

Only explicitly registered public repositories are read. Visibility is checked on every sync and import, including after a repository becomes private. Patches are bounded and treated as untrusted evidence. Documents must pass the English-only schema and reference actual commits from the batch or the existing lesson. Generated explanations can still be mistaken: inspect the cited code and applicability before using them. Verification sections describe checks to perform, not test execution claims.

D1 is the source of truth for live documents and revisions. Vectorize stores a derived search index. The `content/` directory contains initial examples, not a manually maintained copy of the live collection. New lessons publish directly without a site rebuild. `GET /api/export` provides a full current document backup; `npm run export` writes Markdown files.

## Agent access

| Endpoint | Purpose |
| --- | --- |
| `/llms.txt` | Discover topics and agent entry points |
| `/agents.md` | Retrieval workflow and reusable development instructions |
| `/api/search?q=description&repo=owner/name` | Ranked results with triggers, invariants, scope, Markdown URLs, and commit evidence; repository filter is optional |
| `/lessons/{slug}.md` | Read the full article |
| `/llms-full.txt` | Read all active lessons in one response |
| `/api/index.json` | Structured document index |
| `/openapi.json` | Search and retrieval API schema |
| `/api/export` | Export structured documents and rendered Markdown |

HTML article URLs also accept `Accept: text/markdown`. Search accepts natural language in multiple languages; stored documents, navigation, and generation instructions are English. Keyword search remains available if semantic retrieval is unavailable.

An agent must be given the site's entry point: `llms.txt` does not automatically configure other agents. Copy the short instructions from `/agents.md` into the relevant workspace's `AGENTS.md` or equivalent instructions.

## Document format

`src/knowledge.ts` defines the validated schema. Initial documents in `content/` are complete examples. Every article contains:

1. Title, summary, repository, category, tags, and status.
2. Natural-language triggers: when this lesson applies.
3. The behavioral invariant to preserve.
4. Symptoms and root cause.
5. The final solution, including superseded attempts when supported by evidence.
6. Verification steps that cover intermediate and final states.
7. Applicability and limits.
8. Exact 40-character commit SHAs and an explanation of what each proves.

## Develop and verify

Requires Node.js 22 or newer.

```sh
npm ci
npm test
npm run build
npx wrangler d1 migrations apply engineering-notes --local
npm run dev
```

`npm run docs:build` builds the VitePress application and generates the Worker HTML template. Tests, builds, development, and direct Wrangler deployment run this automatically. Generated files stay out of Git. VitePress is used as a build tool; `npm run dev` serves the Worker with Wrangler, not a Vite development server.

Static assets contain only the application and theme, never D1 documents, navigation titles, share tokens, or credentials. Bootstrap scripts are external files to preserve the script CSP. Live Markdown is rendered as inert HTML, never compiled as Vue code.

Tests use real SQLite/FTS5 and stub external services. They cover the English format, rendered routes, retrieval fallback, authentication, citation validation, document preservation on failure, revisions, and automatic cursor advancement. Semantic relevance and actual model output also need live verification after changes to the prompt or embedding model.

## Deploy

The checked-in Wrangler configuration targets `engineering-notes.tianzezhao.com`. Deploy the companion `/api/notes-sso` route in `../syntaxskills-auth` before deploying Notes. For a new account, create a D1 database and a Vectorize index with 1,024 dimensions and cosine distance, then replace the database ID. Add a string metadata index for `repo` before inserting vectors. Bind Workers AI and set a strong `ADMIN_TOKEN` with `wrangler secret put`. Set a `GITHUB_TOKEN` secret for reliable ingestion: unauthenticated GitHub requests from shared Worker addresses can immediately hit rate limits. Public repository read access is sufficient.

```sh
npx wrangler d1 migrations apply engineering-notes --remote
npm run deploy
```

Management commands and exports require `NOTES_URL` and `NOTES_ADMIN_TOKEN` in the environment. Credentials must never be committed. Browser retrieval requires SyntaxSkills login; only explicit article share links allow anonymous reading.

```sh
# Follow future commits from the current main branch head.
npm run source -- owner/repo

# For a new source, optionally begin after an earlier full commit SHA.
npm run source -- owner/repo 0123456789abcdef0123456789abcdef01234567

# Import the initial articles once, after registering syntaxskills/muxmap.
npm run seed

# Run a check now; otherwise the hourly job handles it.
npm run sync -- owner/repo

# Save current articles as Markdown.
npm run export -- exports
```

Registering an existing repository does not reset its cursor. Do not rerun the initial seed import over automatically updated articles unless intentionally restoring those examples. `PUT /api/admin/sources` also accepts a `branch` field; the CLI uses `main`. Authenticated `/api/admin/status` includes error details and cursors.

## Operating limits

The initial collector checks up to four sources per hourly run, oldest checked first. Each commit is considered separately so unrelated changes do not dilute extraction. Evidence is limited to twelve files and 12,000 patch characters per commit, distributed across files. Oversized evidence is rejected without advancing the cursor. GitHub requests use `GITHUB_TOKEN` when configured and remain subject to GitHub's rate limit. Large histories catch up over multiple runs; large-scale ingestion needs adjusted scheduling.

The language model does not run repository code or tests. Publication validates structure and references, not every causal claim. Previous revisions remain in D1's `revisions` table. Diverged Git history requires inspecting the stored cursor instead of silently dropping unprocessed commits.

## References

- [llms.txt specification](https://llmstxt.org/)
- [Workers AI BGE-M3 embeddings](https://developers.cloudflare.com/workers-ai/models/bge-m3/)
- [Workers AI Qwen3 generation](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/)
- [Workers AI GPT-OSS review](https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/)

After changing the embedding text or model, reindex current documents with authenticated `POST /api/admin/reindex` and a JSON body containing `slugs` (up to ten at a time). This rebuilds vectors without rewriting articles or revisions. Vectorize updates are eventually consistent; verify retrieval after the index catches up.
