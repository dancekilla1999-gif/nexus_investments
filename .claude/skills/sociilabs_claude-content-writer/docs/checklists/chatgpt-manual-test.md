# Manual Test Checklist: ChatGPT Custom GPT

**Prerequisite:** Follow `docs/setup-chatgpt.md` to create the Content Writer Custom GPT.

**Test Goal:** Check that the Content Writer Custom GPT works end to end through all five phases with correct state management.

---

## Checklist

### 1. Custom GPT Creation: Instructions Length Verification
**Action:** Create a new Custom GPT. Paste the full contents of `skills/adapters/chatgpt/INSTRUCTIONS.md` into the Instructions field.

**PASS if:** 
- The GPT Builder accepts the full instructions with no truncation errors
- The pasted text shows about **4,424 characters**. Check in the UI that the full text is present.
- You can save the GPT with no "instructions too long" errors

**FAIL if:** The UI cuts the instructions, shows a character-count warning, or refuses to save. Note: the assumed limit is about 8,000 characters per RESEARCH.md Assumption A1, but this limit is unverified.

---

### 2. Knowledge Files Upload Verification
**Action:** Upload all 14 knowledge files from `skills/adapters/chatgpt/knowledge/` to the GPT.

**PASS if:** All 14 files upload with no errors:
- `anti-ai-checklist.md`
- `content-frameworks.md`
- `content-packages.md`
- `email-content-conventions.md`
- `facebook-conventions.md`
- `instagram-conventions.md`
- `profile-management.md`
- `research-workflow.md`
- `sales-content-conventions.md`
- `seo-meta-conventions.md`
- `state-schema.md`
- `twitter-conventions.md`
- `web-content-conventions.md`

**FAIL if:** Any file fails to upload, shows a scan error, or is missing from the knowledge list.

---

### 3. Profile-First Enforcement
**Action:** Start a new chat with your Custom GPT. Type: "Write me a LinkedIn post about AI productivity tools"

**PASS if:** The GPT asks about your profile or offers to create one before it writes content. If no profile exists, the GPT runs the 10-topic questionnaire and outputs `PROFILE.md`, `PRODUCTS.md`, `CTAS.md`, and `CASE-STUDIES.md` for you to save. The 10 topics are brand identity, industry, audience, voice and tone, content strategy, products, case studies, CTAs, publishing workflow, and SEO strategy.

**FAIL if:** The GPT writes content with no profile or skips the questionnaire.

---

### 4. Discuss Phase: Conversational Requirements
**Action:** Continue with the content request.

**PASS if:** The GPT asks about the following in a conversational way:
- Topic and angle
- Platform and content type
- Audience (who specifically, what they believe)
- Stage of awareness
- Goal
- Framework suggestion
- Length and format
- Research inputs
- CTA selection

**FAIL if:** Questions are rigid or form-like, required fields are skipped, or the GPT jumps to writing.

---

### 5. Plan Phase: Outline and SEO Strategy
**Action:** Go to the planning phase.

**PASS if:** The GPT outputs:
- A section-by-section outline
- An SEO strategy (primary keyword, secondary keywords, meta title, meta description, URL slug)
- **PROJECT-STATE.md output as a fenced code block** with an instruction to save it and re-paste it

**FAIL if:** No outline, no SEO strategy, or no state document output.

---

### 6. Execute Phase: Draft Generation
**Action:** Go to the execute phase.

**PASS if:** The GPT writes a complete draft that:
- Follows the outline
- Uses active voice and specific details
- Avoids AI patterns
- **Ends with PROJECT-STATE.md output as a fenced code block**

**FAIL if:** The draft ignores the outline or there is no state document output.

---

### 7. Verify Phase: Quality Checks
**Action:** Go to the verify phase.

**PASS if:** The GPT does the following:
- SEO check (keyword placement, meta tags)
- Anti-AI audit (checks against `anti-ai-checklist.md` patterns)
- Presents findings and applies fixes
- **Ends with PROJECT-STATE.md output as a fenced code block**

**PASS if the STE compliance gate also works (v2.4.0):**
- The GPT runs an STE self-lint at verify. ChatGPT cannot run the Node linter, so this self-lint is a MANUAL check against the `ste-writing-rules.md` knowledge file.
- The GPT catches a draft with a banned word (for example `utilize` or `seamless`) and fixes it before ship.
- The state block records `ste_gate: manual`.
- Ship does not go ahead when the gate fails.

**FAIL if:** No verification runs, the STE self-lint is skipped, a banned word passes to ship, the state block omits `ste_gate: manual`, or ship goes ahead on a failing gate.

---

### 8. Ship Phase: Final Output with Frontmatter
**Action:** Go to the ship phase.

**PASS if:** The GPT outputs:
- Final content with YAML frontmatter (title, platform, framework, word_count, created date, author, status, seo fields)
- Platform-specific publishing notes
- **PROJECT-STATE.md output as a fenced code block** with an instruction to save it and re-paste it

**FAIL if:** Missing frontmatter, no publishing notes, or no state document output.

---

### 9. State Persistence: Re-Paste Verification
**Action:** 
1. Copy the PROJECT-STATE.md from the end of any phase
2. Save it to a file
3. Start a **fresh conversation** with the GPT
4. Paste the PROJECT-STATE.md content
5. Ask: "Continue from where we left off"

**PASS if:** The GPT reads the current phase from the state document and continues from there. For example, if the state shows `phase: plan`, the GPT goes to execute.

**FAIL if:** The GPT does not read the state, starts over, or asks you to repeat information already in the state.

---

### 10. State-Carrying Rule Compliance: Never Claims to Save
**Action:** Review the GPT responses at the end of each phase.

**PASS if:** 
- The GPT **always** outputs the full PROJECT-STATE.md as a code block
- The GPT **always** tells you to `copy, save, and re-paste` the state
- The GPT **never** says `I saved your state`, `I have updated your project file`, or implies that it wrote to knowledge storage

**FAIL if:** The GPT claims to save state, says `your state is stored`, or implies persistence that does not exist (per Pitfall 2).

---

## Summary

| Step | Description | Result |
|------|-------------|--------|
| 1 | Instructions Length Verification | ☐ PASS ☐ FAIL |
| 2 | Knowledge Files Upload | ☐ PASS ☐ FAIL |
| 3 | Profile-First Enforcement | ☐ PASS ☐ FAIL |
| 4 | Discuss Phase | ☐ PASS ☐ FAIL |
| 5 | Plan Phase | ☐ PASS ☐ FAIL |
| 6 | Execute Phase | ☐ PASS ☐ FAIL |
| 7 | Verify Phase (with STE gate) | ☐ PASS ☐ FAIL |
| 8 | Ship Phase | ☐ PASS ☐ FAIL |
| 9 | State Persistence: Re-Paste | ☐ PASS ☐ FAIL |
| 10 | State-Carrying Rule Compliance | ☐ PASS ☐ FAIL |

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

*This checklist verifies VERIFY-01 for the ChatGPT platform adapter.*
