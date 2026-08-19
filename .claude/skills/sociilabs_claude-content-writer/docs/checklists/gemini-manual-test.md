# Manual Test Checklist: Google Gemini Gem

**Prerequisite:** Follow `docs/setup-gemini.md` to create the Content Writer Gem.

**Test Goal:** Check that the Content Writer Gem works end to end through all five phases. Check state management and feature degradation too.

---

## Checklist

### 1. Instructions Character Limit Verification
**Action:** Before you save your Gem, paste the full contents of `skills/adapters/gemini/INSTRUCTIONS.md` into the Gem builder.

**PASS if:**
- The Gem builder accepts the full instructions without truncation
- The UI shows no character-limit warnings
- You can save the Gem

**FAIL if:** The UI cuts the instructions or shows a character-count warning. Gemini publishes no official limit. Informal reports suggest 10,000 to 30,000 characters per RESEARCH.md Assumption A6.

---

### 2. Knowledge Sources Upload: 10-Source Verification
**Action:** Upload all knowledge files from `skills/adapters/gemini/knowledge/` to the Gem.

**PASS if:** All **10 files** upload:
- `anti-ai-checklist.md`
- `content-frameworks.md`
- `email-content-conventions.md`
- `profile-management.md`
- `research-workflow.md`
- `sales-content-conventions.md`
- `seo-meta-conventions.md`
- **`social-conventions.md`** (merged file with Twitter/X, Facebook, and Instagram)
- `state-schema.md`
- `web-content-conventions.md`

**Important:** Check that `social-conventions.md` is present. This merged file replaces three separate platform files because of the 10-source limit in Gemini.

**FAIL if:** Any file fails to upload, or you have fewer than 10 knowledge sources.

---

### 3. Profile-First Enforcement
**Action:** Open your Gem and type: "Write me a LinkedIn post about startup funding"

**PASS if:** The Gem asks about your profile or offers to create one before it writes content. If no profile exists, it runs the 10-topic questionnaire. It then outputs `PROFILE.md`, `PRODUCTS.md`, `CTAS.md`, and `CASE-STUDIES.md` for you to save.

**FAIL if:** The Gem writes content without a profile or skips the questionnaire.

---

### 4. Discuss Phase: Conversational Requirements Gathering
**Action:** Continue with the content request.

**PASS if:** The Gem asks about the following points in a conversation:
- Topic and angle
- Platform and content type
- Audience (who specifically, what they believe)
- Stage of awareness
- Goal
- Framework suggestion
- Length and format
- Research inputs
- CTA selection

**FAIL if:** Questions are rigid or form-like, required fields are skipped, or the Gem jumps to writing.

---

### 5. Plan Phase: Outline and SEO Strategy
**Action:** Go to the planning phase.

**PASS if:** The Gem outputs:
- A section-by-section outline
- An SEO strategy (primary keyword, secondary keywords, meta title, meta description, URL slug)
- **PROJECT-STATE.md as a fenced code block** with an instruction to save it and paste it back

**FAIL if:** No outline, no SEO strategy, or no state document.

---

### 6. Execute Phase: Draft Generation
**Action:** Go to the execute phase.

**PASS if:** The Gem writes a full draft that:
- Follows the outline
- Uses active voice and specific details
- Avoids AI patterns
- **Ends with PROJECT-STATE.md as a fenced code block**

**FAIL if:** The draft ignores the outline or there is no state document.

---

### 7. Verify Phase: Quality Checks
**Action:** Go to the verify phase.

**PASS if:** The Gem does the following:
- SEO check (keyword placement, meta tags)
- Anti-AI audit (checks against `anti-ai-checklist.md` patterns)
- STE self-lint at verify. The Gem cannot run the Node linter, so this is a MANUAL self-lint. The STE law sits inside `anti-ai-checklist.md` because of the 10-source limit.
- Presents findings and applies fixes
- **Ends with PROJECT-STATE.md as a fenced code block**

**STE compliance gate (v2.4.0):**
- Check that the STE self-lint runs at verify, not just the anti-AI pattern scan.
- Feed a draft with a banned word (for example `utilize` or `seamless`). Check that the Gem catches it and fixes it before ship.
- Check that the state block records `ste_gate: manual`.
- Check that ship does not go ahead while the gate fails.

**FAIL if:** No verification runs, the STE self-lint is skipped, a banned word slips through, or there is no state document.

---

### 8. Ship Phase: Final Output with Frontmatter
**Action:** Go to the ship phase.

**PASS if:** The Gem outputs:
- Final content with YAML frontmatter (title, platform, framework, word_count, created date, author, status, seo fields)
- Platform-specific publishing notes
- **PROJECT-STATE.md as a fenced code block** with an instruction to save it and paste it back

**FAIL if:** No frontmatter, no publishing notes, or no state document.

---

### 9. State Persistence: Re-Paste Verification
**Action:**
1. Copy the PROJECT-STATE.md from the end of any phase
2. Save it to a file
3. Start a **fresh conversation** with the Gem
4. Paste the PROJECT-STATE.md content
5. Ask: "Continue from where we left off"

**PASS if:** The Gem reads the current phase from the state document and continues from there.

**FAIL if:** The Gem does not recognize the state or starts over.

---

### 10. Content Packages Feature Degradation
**Action:** Request a capability that needs `content-packages.md`: "Create a multi-platform content package for my product launch across LinkedIn, Twitter, and email"

**PASS if:** The Gem tells you clearly:
> "Multi-platform content packaging is not available in this Gemini Gem due to the 10-source knowledge limit. This capability is available in the Claude Code, Claude.ai, or ChatGPT adapters instead."

The Gem must **not** build the package anyway, drop the request in silence, or claim the capability is available.

**FAIL if:** The Gem tries to build a multi-platform package, says it can do it but returns incomplete results, or does not name the limitation.

---

## Summary

| Step | Description | Result |
|------|-------------|--------|
| 1 | Instructions Character Limit | ☐ PASS ☐ FAIL |
| 2 | 10 Knowledge Sources Upload | ☐ PASS ☐ FAIL |
| 3 | Profile-First Enforcement | ☐ PASS ☐ FAIL |
| 4 | Discuss Phase | ☐ PASS ☐ FAIL |
| 5 | Plan Phase | ☐ PASS ☐ FAIL |
| 6 | Execute Phase | ☐ PASS ☐ FAIL |
| 7 | Verify Phase (with STE gate) | ☐ PASS ☐ FAIL |
| 8 | Ship Phase | ☐ PASS ☐ FAIL |
| 9 | State Persistence: Re-Paste | ☐ PASS ☐ FAIL |
| 10 | Content Packages Degradation | ☐ PASS ☐ FAIL |

**Overall Result:** ☐ **PASS** (all steps passed) ☐ **FAIL** (one or more steps failed)

---

## Failure Documentation

If any step failed, attach the failing step transcript to help diagnose the issue.

**Failed Step(s):** ___________________

**Transcript:**
```
[Paste failing step conversation here]
```

---

*This checklist verifies VERIFY-01 for the Gemini platform adapter.*
