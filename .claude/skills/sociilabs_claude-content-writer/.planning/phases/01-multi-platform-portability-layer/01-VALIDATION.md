---
phase: 1
slug: multi-platform-portability-layer
status: planned
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Derived from `01-RESEARCH.md`'s Validation Architecture section. Planning is complete — 13 PLAN.md files exist in this phase directory and `gsd-plan-checker` confirmed (2026-07-04) that every `auto`-type task carries an `<automated>` verify command and the one `checkpoint:human-verify` task (01-13 Task 1) is justified. Task ID/Plan/Wave detail lives in the PLAN.md frontmatter itself; this file remains the requirement-level map.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None currently — no test script in `package.json`, no test directory in the repo |
| **Config file** | none — Wave 0 creates the first test surface this repo has ever had |
| **Quick run command** | `node scripts/verify-writer-commands.js` (does not exist yet — Wave 0) |
| **Full suite command** | Same — this is the only automated test surface for this phase; everything else is manual-only by design (see below) |
| **Estimated runtime** | ~seconds (structural lint / grep-based, not a real test runner) |

---

## Sampling Rate

- **After every task commit:** `node scripts/verify-writer-commands.js`
- **After every plan wave:** Same command
- **Before `/gsd-verify-work`:** Structural lint green + all three VERIFY-01 manual checklists completed by the human
- **Max feedback latency:** a few seconds (no build/install step)

---

## Per-Task Verification Map

Task IDs are assigned during planning. Until then, this is the requirement-level map the planner must satisfy:

| Requirement | Behavior | Test Type | Automated Command | File Exists? |
|-------------|----------|-----------|--------------------|--------------|
| PORTABLE-01 | Reference docs contain no Claude-Code-specific syntax | structural lint | `grep -rn "\[Content Writer\]\|~/.claude\|@~/.claude" references/` (expect zero matches) | ❌ Wave 0 |
| PORTABLE-02 / PORTABLE-03 | Portable state document schema has required phase-tracking fields | structural lint | `node scripts/verify-writer-commands.js --check=schema` | ❌ Wave 0 |
| ADAPTER-01 | `/writer:*` skill files reference file-based state, not stale memory-key-only logic | structural lint | `node scripts/verify-writer-commands.js --check=migration` | ❌ Wave 0 |
| ADAPTER-01 | Existing `/writer:*` command behavior unchanged from the user's perspective | manual-only | N/A — human runs all five phases in Claude Code once, post-migration | manual-only, justified |
| ADAPTER-02 | Claude.ai/API Skill bundle loads and responds correctly | manual-only | N/A — VERIFY-01 checklist | manual-only, justified |
| ADAPTER-03 | ChatGPT Custom GPT reproduces the phased workflow | manual-only | N/A — VERIFY-01 checklist | manual-only, justified |
| ADAPTER-04 | Gemini Gem reproduces the phased workflow | manual-only | N/A — VERIFY-01 checklist | manual-only, justified |
| ADAPTER-05 | Headless agent can drive one phase via structured I/O without blocking | automatable if a reference MCP server is built | e.g. `node adapters/mcp-server/server/test-harness.js` calling each tool once with fixture input | ❌ Wave 0 — depends on planner's resolution of Open Question 2 (contract-only vs. + reference implementation) |
| VERIFY-02 | Automated check confirms Claude Code commands still function post-migration | structural lint | `node scripts/verify-writer-commands.js` | ❌ Wave 0 |

*Status: all ⬜ pending — planning has not produced tasks yet.*

---

## Wave 0 Requirements

- [ ] `scripts/verify-writer-commands.js` — covers PORTABLE-02/03, ADAPTER-01, VERIFY-02; this repo has no test infrastructure of any kind today
- [ ] `docs/checklists/claude-ai-manual-test.md`, `chatgpt-manual-test.md`, `gemini-manual-test.md` — covers VERIFY-01; must be authored, not just referenced
- [ ] Planner decision on Open Question 2 (MCP contract-only vs. contract + reference implementation) before ADAPTER-05's automated coverage can be scoped precisely
- [ ] No framework install required — plain Node scripts, zero new dependencies, consistent with this repo's existing zero-dependency footprint

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|-------------|--------------------|
| Full Discuss→Plan→Execute→Verify→Ship cycle in Claude Code, post-migration | ADAPTER-01 | No test harness exists for slash-command behavior in this repo | Human runs `/writer:discuss`, `/writer:plan`, `/writer:execute`, `/writer:verify`, `/writer:ship` once end-to-end and confirms output matches pre-migration behavior |
| Claude.ai Skill bundle end-to-end | ADAPTER-02 | claude.ai's skill-upload UI can't be scripted by the building agent (locked decision) | `docs/checklists/claude-ai-manual-test.md` |
| ChatGPT Custom GPT end-to-end | ADAPTER-03 | GPT Builder UI can't be scripted by the building agent (locked decision) | `docs/checklists/chatgpt-manual-test.md` |
| Gemini Gem end-to-end | ADAPTER-04 | Gem builder UI can't be scripted by the building agent (locked decision) | `docs/checklists/gemini-manual-test.md` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or an explicit, justified manual-only entry above
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (`scripts/verify-writer-commands.js` in 01-02; 3 checklists in 01-12)
- [x] No watch-mode flags
- [x] Feedback latency < a few seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-04 (gsd-plan-checker: VERIFICATION PASSED, 0 blockers, 2 non-blocking documentation-sync warnings resolved in this file and 01-RESEARCH.md)
