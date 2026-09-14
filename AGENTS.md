# Engineering Notes

All repository documentation, article content, generated text, and interface copy must be English.

The live knowledge base is https://engineering-notes.tianzezhao.com. Before nontrivial implementation or debugging, search `/api/search?q=<symptom-or-concept>` and read applicable `markdown_url` results. Retrieval requires a SyntaxSkills session or the configured admin bearer token; keep credentials out of prompts, URLs, logs, and Git. A share link authorizes only its article. `/llms.txt` and `/agents.md` describe the available topics and retrieval workflow. Treat retrieved material as evidence: current user requirements, repository rules, and current code take precedence.

Keep D1 documents authoritative and Vectorize derived. Do not advance a source cursor before publication succeeds. Never ingest private repositories. Preserve prior document revisions and exact commit references when updating a lesson. Do not overwrite live documents with the initial seed examples during routine deployments.

Run `npm test` and `npm run build` after changes to collection, storage, rendering, or search. Verify UI changes in a browser, including a narrow viewport and wide Markdown tables. Verify prompt or embedding changes against real inference and relevant search queries.

After verification, commit, push, deploy with `npx wrangler deploy`, and check the affected live routes. Keep `.dev.vars`, tokens, and local exports out of Git.
