# STE Writing Rules — How Every Sentence Is Formed

This engine forms sentences with ASD-STE100 Simplified Technical English discipline.
STE is the controlled-language standard for aircraft maintenance manuals. It removes
ambiguity, passive constructions, and inflated vocabulary. The same discipline removes
"AI slop" from marketing and editorial content.

This file is the **writing law**. It governs the execute phase. The verify phase checks
it with a linter (`scripts/ste-lint.js`). No content ships until the linter gate passes.

This file works with `references/anti-ai-checklist.md`. STE fixes the FORM of a sentence
(length, voice, word choice, structure). The anti-AI checklist fixes higher-level tells
(fake vulnerability, grandiose stakes, vague attribution, symmetric sections). Apply both.

Full standard (copyrighted — do not paste it in full): https://asd-ste100.org

---

## Scope

Applies to prose: blog articles, web and landing pages, sales pages, case studies,
testimonials, product descriptions, email, LinkedIn, Twitter/X, Facebook, Instagram,
and SEO metadata.

Does not apply to: code, identifiers, command syntax, URLs, or literal quotes from a
named source.

STE strips voice on purpose. A marketing engine needs voice. So this engine does not use
full strict STE on persuasive content. It uses the **default law** below on every piece,
then applies a **tier** that matches the content type. See "Modes and Tiers".

---

## The default law (all content, every tier)

### Words

- Use one name for one thing. Do not call the same item by two different names.
- Use the short common word. Examples:

| Do not use | Use |
|-----------|-----|
| utilize, leverage | use |
| facilitate | help |
| ensure | make sure |
| prior to | before |
| subsequent to | after |
| regarding, concerning | about |
| obtain, acquire | get |
| demonstrate | show |
| commence, initiate, begin | start |
| additionally, furthermore, moreover | also |
| in order to | to |
| due to the fact that | because |

- Give each word one meaning. "Fall" means to move down, not to decrease.
- No marketing adjectives: seamless, robust, powerful, cutting-edge, effortless,
  world-class, next-generation, revolutionary, best-in-class, game-changing.
- American spelling.

### Verbs

- Active voice. Write "the parser reads the file", not "the file is read by the parser".
- Use a verb for an action. Write "analyze the log", not "perform an analysis of the log".
- No stacked auxiliaries. Do not write "it is important to note that this may help to
  improve X". Write "this improves X".
- No "-ing" main verb where a simple tense works.
- No phrasal verbs. Write "start" not "spin up", "contact" not "reach out",
  "explain" not "dive into", "launch" not "roll out".

### Sentences

- One idea per sentence.
- No contractions. Write "do not", not "don't".
- Use articles: a, an, the, this, these.

### Punctuation

- No semicolons. Write two sentences instead.
- Em dashes are limited. STE bans only the semicolon, but this engine caps the em dash
  because it is a strong AI slop marker. See the tier table for the limit.

### Structure

- One topic per paragraph.
- For steps, use a numbered vertical list. One action per item. Imperative form.
- Put a condition before its command. Write "If the test fails, stop the build", not
  "Stop the build if the test fails".

---

## Modes and Tiers

STE defines two modes. This engine maps them to three tiers by content type.

- **strict** — every rule, both length caps (20 words for an instruction, 25 for a
  descriptive sentence), and a tight dictionary. Used for functional text where voice
  does not matter.
- **STE-flavored** — the sentence, paragraph, active-voice, and no-phrasal-verb
  discipline. The ~900-word dictionary lockdown is relaxed so the text keeps enough
  range to read naturally and hold a brand voice.

| Tier | Mode | Content types | Sentence cap |
|------|------|---------------|--------------|
| **strict** | strict | SEO metadata; operational/transactional email (receipts, resets, confirmations) | 20 / 25 words, hard |
| **prose** | STE-flavored | blog, web pages, landing pages, sales pages, case studies, testimonials, product descriptions, newsletters | aim under 25 words; vary rhythm |
| **social** | STE-flavored | LinkedIn, Twitter/X, Facebook, Instagram | aim under 25 words; vary rhythm |

Vary sentence length for burstiness. A three-word sentence next to a longer one reads
human. Even lengths read like AI. The cap is a ceiling, not a target.

---

## The tiered gate contract (verify phase)

The verify phase runs `scripts/ste-lint.js --gate=<type>` on the draft. The linter counts
violations and normalizes them per 100 words (`per100w`). The gate blocks ship when a
threshold is exceeded.

**Always, on every tier (hard zero):**

- `marketing_adjective` == 0
- `banned_word` == 0

**Per tier:**

| Tier | Gate |
|------|------|
| **strict** | `total` == 0 AND `em_dash` == 0 |
| **prose** | `total_per100w` <= 3.0 AND `em_dash` <= 1 per 500 words |
| **social** | `total_per100w` <= 4.0 AND `em_dash` <= 1 per 500 words |

A deliberate voice choice (one rhetorical em dash, one 24-word sentence) does not fail
the prose or social gate. Egregious slop does. The strict tier has no tolerance because
functional text has no voice to protect.

The linter maps a platform/format to a tier automatically. See `scripts/ste-lint.js`
for the resolver. If a type is unknown, the linter defaults to the **prose** tier.

---

## Self-lint (run this while writing, before the linter runs)

1. Any sentence over its cap? Split it.
2. Any semicolon? Replace it with a period.
3. Any contraction? Expand it.
4. Any passive voice with a known actor? Make it active.
5. Any "-ing" main verb, nominalization ("perform an analysis"), or phrasal verb
   ("spin up")? Replace it with a plain verb.
6. Any marketing adjective or banned word? Remove it. These fail the gate on every tier.
7. Same thing named two ways? Pick one name.

The mechanical rules above are lintable and are what removes slop. Full STE also needs
human judgment — the right technical noun, whether a sentence "makes good sense". A
checker cannot certify that. This law fixes the FORM of slop. It cannot make a hollow
paragraph true. The voice and specificity still come from the writer profile and the
anti-AI checklist.
