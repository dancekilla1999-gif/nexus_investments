# Third-party notices

The contents of `.claude/skills/`, `.claude/agents/`, and `.claude/commands/` were imported
from [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit), which is
distributed under the MIT License:

```
MIT License

Copyright (c) 2026 Leonardo Flores

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Not carried over: `.claude-plugin/marketplace.json` and `dist/` from the source repo — this
environment does not support the `/plugin` marketplace mechanism, so skills/agents/commands
were flattened directly into this repo's `.claude/` directory as project-level assets instead.

Several imported skills call out to external CLIs or services not configured in this
repository/environment (`codex`, `gemini`, `jira`, `datadog-cli`, `perplexity`,
`web-to-markdown`'s local `web2md`). Their `SKILL.md` files are present, but those skills will
only function once the corresponding tool/credentials are set up.

---

## Second import: 22 community skill repositories (2026-08-19)

393 additional skills were imported from the 22 GitHub repositories linked in a
user-provided spreadsheet (a curated "awesome Claude skills" list), on request to
"go into each repo and extract every skill that's there." Given the actual scale found
(~1,300 skills total once every repo was cloned), the user chose: **import every genuine
skill from every repo, except `ComposioHQ/awesome-claude-skills`' `composio-skills/`
subtree** (836 auto-generated one-skill-per-SaaS-integration wrappers — a directory of
thin API wrappers, not a curated skill set).

### What was excluded from the ~1,300 found, and why

- **`composio-skills/*`** (836 files) — excluded per explicit user decision above.
- **Test fixtures** — `yusufkaraaslan/Skill_Seekers`'s `tests/golden/phase2/*` (24 files)
  are golden-test scaffolding for that project's own test suite, not shippable skills.
- **Boilerplate templates** — `anthropics/skills`' `template/` and
  `ComposioHQ/awesome-claude-skills`' `template-skill/` are fill-in-the-blank scaffolds
  ("Replace with description of the skill..."), not real skills.
- **Internal cache duplicates** — `AgriciDaniel/claude-blog`'s
  `brain/.raw/sources/claude-blog-skill/skills/*` (31 files) is that project's own vendored
  cache of its sibling `claude-blog` skill set, byte-for-byte the same content already
  present at `skills/*` in the same repo.
- **`BehiSecc/awesome-claude-skills`** — this repository contains **zero** skill files. It
  is a pure Markdown link index (an "awesome list") pointing to other people's repos —
  including some of the ones already in this batch, and some not in the spreadsheet at
  all. Per the spreadsheet's own instruction ("go into each repo"), its README links were
  **not** recursively followed; nothing was extracted from it.
- **Anthropic-canonical skills vendored elsewhere** — `docx`, `pdf`, `pptx`, `xlsx`,
  `mcp-builder`, `skill-creator`, `brand-guidelines`, `doc-coauthoring`, `canvas-design`,
  `slack-gif-creator`, `webapp-testing`, `internal-comms`, `theme-factory`,
  `web-artifacts-builder`, `frontend-design`, `academy-guide`, `algorithmic-art`,
  `discernment-nudge`, `claude-api` are Anthropic's own officially-named skills. Several
  other repos (`ComposioHQ/awesome-claude-skills`, `openai/skills`,
  `getsentry/sentry-skills`) vendor near-identical copies of these. Only the copy from
  `anthropics/skills` — the canonical upstream — was kept; the other 16 vendored copies
  were dropped rather than kept as noisy near-duplicates.
- **Intra-repo duplicates** — where a single repo had the same skill name at two paths
  (e.g. `openai/skills`' `.system/openai-docs/` vs `.curated/openai-docs/`), only the
  non-hidden-directory copy was kept.

### Name collisions with genuinely different content

A handful of skill names collided across unrelated repos with genuinely different
content (not vendored copies of each other). These were kept, disambiguated with a
`--<source>` suffix: `linear--openai` / `linear--glebis`,
`domain-name-brainstormer--composio` (distinct from the agent-toolkit skill of the same
name imported earlier), `codex--glebis` (distinct from the agent-toolkit `codex` skill).

### Corrected repo paths

Three spreadsheet links pointed at names that no longer exist / were never quite right;
the actual repos were located and used instead:

| Spreadsheet said | Actually cloned from |
|---|---|
| `google-labs-code/skills` | `google-labs-code/stitch-skills` (`shadcn-ui` and `remotion` live under `plugins/stitch-build/skills/`) |
| `firecrawl/firecrawl-skills` | `firecrawl/skills` + `firecrawl/firecrawl-workflows` (the exact `firecrawl-build-*` skill names from the sheet were not found verbatim in either; the closest real skills were taken instead) |
| `yusufkaraaslan/skill-seekers` | `yusufkaraaslan/Skill_Seekers` (capitalized) — and note almost this entire repo's `SKILL.md` files are test fixtures; only `skills/skill-seekers/` and `distribution/claude-plugin/skills/skill-builder/` are real |

### Per-repo license status (as found; not legal advice)

| Repository | Skills kept | License |
|---|---:|---|
| `anthropics/skills` | 19 | No repo-level `LICENSE` file. Copies vendored by `openai/skills` and `ComposioHQ/awesome-claude-skills` ship an Apache-2.0 `LICENSE.txt` per skill, suggesting Apache-2.0 intent, but the canonical repo itself does not state a license. |
| `obra/superpowers` | 14 | MIT — Copyright (c) 2025 Jesse Vincent |
| `vercel-labs/agent-skills` | 9 | README states MIT; **no `LICENSE` file in the repo** |
| `supabase/agent-skills` | 2 | MIT — Copyright (c) 2026 Supabase |
| `google-labs-code/stitch-skills` | 16 | Apache License 2.0 |
| `getsentry/sentry-skills` | 25 | Apache License 2.0 |
| `glebis/claude-skills` | 111 | MIT — Copyright (c) 2025-2026 Gleb Kalinin |
| `openai/skills` | 41 | No repo-level `LICENSE`; each individual skill directory carries its own `LICENSE.txt` (Apache-2.0 for the ones imported here) |
| `firecrawl/skills` | 7 | ISC — Copyright (c) Firecrawl |
| `firecrawl/firecrawl-workflows` | 16 | ISC — Copyright (c) 2026 Firecrawl |
| `coreyhaines31/marketingskills` | 49 | MIT — Copyright (c) 2025 Corey Haines |
| `kepano/obsidian-skills` | 5 | MIT — Copyright (c) 2026 Steph Ango (@kepano) |
| `AgriciDaniel/claude-youtube` | 1 | MIT — Copyright (c) 2025 Daniel Agrici |
| `AgriciDaniel/claude-blog` | 33 | MIT — Copyright (c) 2025-2026 AgriciDaniel |
| `Rushik-Ghuntala/claude-code-skills` | 11 | MIT — Copyright (c) 2026 Rushik Ghuntala |
| `AlexSKuznetsov/claude-skill-telegram` | 1 | **No license file; README says only "provided as-is."** Rights to reuse are unclear. |
| `seedprod/claude-code-telegram` | 2 | README states MIT; **no `LICENSE` file in the repo** |
| `trycourier/courier-skills` | 1 | MIT — Copyright (c) 2026 Courier, Inc. |
| `sociilabs/claude-content-writer` | 2 | README states MIT and links to a `LICENSE` file; **that file does not actually exist in the repo** |
| `ComposioHQ/awesome-claude-skills` | 19 | Apache License 2.0 (per repo README badge) |
| `glitternetwork/pinme` | 7 | MIT — Copyright (c) 2025 PINME |
| `yusufkaraaslan/Skill_Seekers` | 2 | MIT — Copyright (c) 2025 Yusuf Karaaslan |
| `BehiSecc/awesome-claude-skills` | 0 | N/A — link index only, nothing extracted |

**Flagged for follow-up:** `anthropics/skills`, `AlexSKuznetsov/claude-skill-telegram`,
`vercel-labs/agent-skills`, `seedprod/claude-code-telegram`, and
`sociilabs/claude-content-writer` do not have an unambiguous license file in their
repository. They were imported anyway per the user's explicit "take everything real"
decision, but if this repository is ever distributed outside the organization, these five
sources' skills should get a legal look before being redistributed further —
`AlexSKuznetsov/claude-skill-telegram` in particular has no license grant beyond
"provided as-is."

### Naming note

Directory names under `.claude/skills/` are generally the skill's own folder name from its
source repo, which does not always match the `name:` field inside its `SKILL.md`
frontmatter (e.g. `google-labs-code/stitch-skills`' skills declare names like
`stitch::react-components` while the directory is `react-components`; a few single-skill
repos use the full `owner_repo` slug as the directory name because their `SKILL.md` sits
at the repository root, e.g. `AlexSKuznetsov_claude-skill-telegram/`). This mirrors each
skill's own repository layout rather than imposing a new naming scheme.
