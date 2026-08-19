# Anti-AI Writing Checklist

A comprehensive audit guide for removing AI writing patterns from any draft.
Based on: Wikipedia's Signs of AI Writing (WikiProject AI Cleanup), academic research
on perplexity and burstiness detection, the tropes.fyi pattern database, and
peer-reviewed linguistic studies on LLM-generated text markers (2023–2026).

Run every draft through this before delivery. The goal isn't stealth — it's
writing that a specific human actually wrote, not a statistical average of
everything ever published on a topic.

---

## How to use this

**Pass 1 — Hunt.** Read the draft once and mark every pattern from this list you can find. Don't fix yet. Just mark.

**Pass 2 — Rewrite.** Fix everything marked. Then read aloud. Any sentence that could appear in any article about any topic is too generic. Make it specific to this piece, this voice, this context.

**Pass 3 — Soul check.** Ask: does this have a person behind it? If it reads like a competent summary by no one in particular, it still needs work.

---

## Part 1: The science behind what detectors actually catch

Before the pattern-by-pattern list, understand what makes human writing different at a technical level. AI detectors measure two things:

**Perplexity** — how unpredictable your word choices are. Human writers make choices a language model wouldn't predict: an unexpected word, a specific brand name, a concrete detail from lived experience. AI writing optimizes for the most statistically likely next word, which produces low-perplexity text. The fix: use words and examples a model wouldn't default to. Proper nouns, dollar figures, dates, names of specific people, niche terminology. These raise perplexity and flag as human authorship signals.

**Burstiness** — how much your sentence lengths vary. Human writing is structurally bursty. A three-word sentence. Then a long one that winds through a secondary point before landing somewhere. Short again. AI writing is smooth — sentence after sentence in the 15–20 word range, evenly spaced, evenly structured. Research shows burstiness is the single most reliable signal separating human from AI text — more reliable than vocabulary analysis alone.

**Implication for revision:** Synonym swapping doesn't fix either problem. You have to rewrite at the level of structure and content, not just surface word choice.

---

## Part 2: Word-level patterns

### 1. AI vocabulary by era

These words appear at far higher rates in LLM output than in human writing. They're not banned — a human might use any of them — but finding several per page is a strong signal.

**2023–mid-2024 (GPT-4 era):**
Additionally, boasts, bolstered, crucial, delve/delving, emphasizing, enduring, garner, intricate/intricacies, interplay, key (as adjective), landscape (abstract), meticulous/meticulously, pivotal, tapestry, testament, underscore, valuable, vibrant

**Mid-2024–mid-2025 (GPT-4o era):**
Align with, bolstered, crucial, emphasizing, enhance, enduring, fostering, highlighting, pivotal, showcasing, underscore, vibrant

**2025–2026 (all models):**
Certainly, comprehensive, cutting-edge, elevate, groundbreaking, holistic, innovative, leverage (verb), navigate, nestled, paradigm, robust, seamless, streamline, synergy, transformative, utilize

**"Magic adverb" category** — adverbs used to imply understated significance:
Deeply, fundamentally, quietly (as in "quietly reshaping"), remarkably, arguably

**Fix:** When you find one, ask: what's the actual specific word for what I mean? "Robust" means what exactly — reliable? well-tested? production-grade? Use the specific one.

---

### 2. Copula avoidance ("serves as," "stands as," "marks")

LLMs replace simple "is/are/has" with pompous alternatives because their training pushes them toward lexical variety. Academic research documented over a 10% drop in "is/are" usage in post-2022 writing samples.

**AI pattern:**

- "The platform serves as a testament to the team's commitment."
- "Gallery 825 stands as the exhibition space for contemporary art."
- "The policy marks a pivotal moment in the evolution of..."

**Human pattern:**

- "The platform works."
- "Gallery 825 is the exhibition space for contemporary art."
- "The policy changed how the agency handles X."

**Verdict:** If you can replace "serves as" or "stands as" with "is," do it every time.

---

### 3. Marketing verbs substituting for neutral ones

LLMs prefer "features, offers, boasts" over "has." They prefer "showcases" over "shows." Neutral words signal encyclopedic writing; marketing words signal AI.

**Fix:** Replace with "has," "shows," "includes," "is."

---

### 4. Filler phrases (compress or delete)

| AI phrase | Human alternative |
|-----------|------------------|
| "In order to achieve this goal" | "To achieve this" |
| "Due to the fact that" | "Because" |
| "At this point in time" | "Now" |
| "It is important to note that" | [delete entirely] |
| "The system has the ability to" | "The system can" |
| "In the event that" | "If" |
| "It goes without saying that" | [delete — then cut the sentence if it actually goes without saying] |
| "At the end of the day" | [delete] |
| "Moving forward" | [delete or replace with "next"] |
| "In today's fast-paced world" | [delete — this opener appears in more AI text than any other] |

---

### 5. Excessive hedging

**AI pattern:** "It could potentially possibly be argued that the policy might have some effect on outcomes in certain contexts."

**Human pattern:** "The policy may affect outcomes." Or just: "The policy affects outcomes."

The difference between human and AI hedging: humans hedge about things they're genuinely uncertain about. AI hedges reflexively — it adds qualifiers to everything to avoid being wrong, which produces text that commits to nothing.

**Fix:** For each hedge, ask: am I actually uncertain about this? If yes, hedge once, cleanly. If no, remove it.

---

### 6. False exclusivity phrases

Phrases claiming something is secret, overlooked, or unspoken — when the content doesn't back this up.

**AI patterns:**

- "This is the part nobody talks about..."
- "What most people miss is..."
- "This doesn't get enough attention."
- "Here's what nobody's saying."

**Acceptable use:** Only when the thing you're pointing to is genuinely not widely known. Otherwise, delete the phrase and just state the point.

---

## Part 3: Sentence-level patterns

### 7. Negative parallelism ("It's not X — it's Y")

The single most identified AI writing tell in practitioner surveys. Before LLMs, people did not write like this at scale. Includes the causal variant "not because X, but because Y."

**AI patterns:**

- "It's not bold. It's backwards."
- "It's not just about autocomplete; it's about unlocking creativity at scale."
- "Not recklessly, not completely — but enough."

**Human pattern:** Just state the actual point. The reframe construction is almost never necessary. "It unlocks creativity at scale" is cleaner than "it's not just autocomplete; it's about unlocking creativity at scale."

---

### 8. Dramatic countdown: "Not X. Not Y. Just Z."

Builds tension by negating two things before the reveal. The reveal is usually not dramatic enough to justify the setup.

**AI pattern:** "Not a bug. Not a feature. A fundamental design flaw."

**Fix:** "This is a design flaw." Done.

---

### 9. Self-posed rhetorical questions ("The result? Devastating.")

AI asks questions nobody was asking, then answers them immediately for dramatic effect. These questions never appear in good writing without a genuine reason.

**AI patterns:**

- "The result? Devastating."
- "The worst part? Nobody saw it coming."
- "And the best part?"

**Fix:** Convert to a direct statement. "The result was devastating." Better yet: specify *why* it was devastating.

---

### 10. Rule of three / tricolon abuse

LLMs force ideas into groups of three. Single tricolons can be elegant. Multiple back-to-back tricolons are a pattern recognition failure.

**AI pattern:** "streamlining processes, enhancing collaboration, and fostering alignment"

**Fix:** Use the number of items the content actually has. One point elaborated is better than three points summarized. Two is often more honest than three. Four is sometimes right. Match the count to reality, not to rhetorical tradition.

---

### 11. Triple anaphora (three sentences starting with the same word)

**AI pattern:**
"We can't afford to wait. We can't sign away the IP. We can't agree to these terms."

**Human pattern:** Break the repetition after the second instance. Humans don't sustain perfect anaphora naturally — they start with it and then drift. Sustaining it for four or five iterations is a structural tic, not a stylistic choice.

---

### 12. Anaphora abuse at scale

AI repeats the same sentence opener across an entire paragraph or section.

**AI pattern:**
"They assume users will pay... They assume developers will build... They assume ecosystems will emerge... They assume adoption will follow..."

**Fix:** After the second or third repetition, the construction has made its point. Cut the rest or restructure.

---

### 13. Superficial "-ing" analysis at sentence ends

AI attaches a present participle phrase to the end of sentences to inject fake analytical depth. The "-ing" phrase sounds like insight but says nothing specific.

**AI patterns:**

- "The platform launched in 2023, highlighting its commitment to innovation."
- "The policy was updated, reflecting broader industry trends."
- "The study was published in Nature, showcasing the team's rigorous methodology."

**Test:** Remove the "-ing" phrase. If the sentence loses no actual information, the phrase was padding.

**Fix:** If there's a real insight there, state it as a separate sentence with a specific claim. If there isn't, delete the phrase.

---

### 14. False ranges ("from X to Y")

Using "from X to Y" when X and Y aren't on a real spectrum. AI uses this as a fancy way to list two loosely related things.

**AI patterns:**

- "From innovation to cultural transformation."
- "From startups to enterprise organizations."
- "From the Big Bang to dark matter."

**Fix:** List the items directly. "Startups and enterprise organizations." Or name the actual spectrum if one exists.

---

### 15. Gerund fragment litany

After a claim, AI "illustrates" it with a stream of verbless gerund fragments. These add word count but no content.

**AI pattern:**
"The team was overloaded. Reviewing pull requests. Debugging edge cases. Attending architecture meetings."

**Fix:** If the illustration is worth keeping, write it as a sentence with a subject. If it isn't, cut it.

---

### 16. Patronizing analogies ("Think of it as...")

AI defaults to teacher mode. "Think of it as a highway system for data." Often the analogy is less clear than the original concept.

**AI patterns:**

- "Think of it as a Swiss Army knife for your workflow."
- "It's like asking someone to buy a car they're only allowed to sit in while it's parked."

**Fix:** Trust the reader. If the concept needs an analogy, use one — but make sure it clarifies rather than replaces precision.

---

### 17. Curly/smart quotes instead of straight quotes

A minor technical tell. AI outputs curly quotation marks ("like this") rather than the straight quotes that result from typing on a keyboard ("like this"). Minor, but observable in unedited output.

---

## Part 4: Paragraph and structure patterns

### 18. Symmetric section treatment (democratic attention allocation)

AI gives every section equal treatment. If a piece covers four factors, each gets an identical-length paragraph. Pros and cons are presented with perfect symmetry.

**Human pattern:** Humans show bias. They spend three paragraphs on what interests or concerns them and a sentence on what doesn't. They dwell on the surprising finding and rush past the expected one. Uniform section length signals no one was actually thinking — just filling out a template.

**Fix:** Identify which sections you (or the author) actually care about. Make those sections longer, richer, more specific. Cut sections that are just obligatory coverage.

---

### 19. Signposting transitions

AI labels its own logical moves rather than letting the logic speak.

**AI patterns:**

- "It's worth noting that..."
- "It bears mentioning..."
- "Importantly,..."
- "Notably,..."
- "This means..." (repeated multiple times per page)

Confident writers make jumps. They trust readers to follow. Constant signposting signals the writer doesn't trust the logic to carry itself.

**Fix:** Delete signposts. If the connection between ideas isn't obvious without the signpost, the real problem is the transition — rewrite it.

---

### 20. Fractal summaries ("what I'll tell you / what I told you")

AI summarizes at every level: intro announces what's coming, each section concludes with a summary, conclusion restates every point.

**AI patterns:**

- "In this section, we'll explore..." (at section start)
- "As we've seen in this section..." (at section end)
- "In conclusion, the future looks bright." (at piece end)

**Fix:** Start the section. End the section. Trust the reader to have read it. The conclusion should introduce a new frame or implication — not restate what was just covered.

---

### 21. Formulaic "challenges and future prospects" structure

AI routinely adds a section that acknowledges problems only to immediately dismiss them. Always follows the same beat: acknowledge challenge → note it's being addressed → optimistic close.

**AI pattern:** "Despite these challenges, the initiative continues to thrive."

**Fix:** Either engage with the challenge specifically (what is the actual problem, what is actually being done about it, does it work) or cut the section. Vague acknowledgment of challenges is worse than no acknowledgment.

---

### 22. One-point dilution

A single argument restated in 10 different ways across thousands of words. The model pads a simple thesis to feel comprehensive.

**Signs:** Each section rephrases the thesis with a different metaphor but adds no new information. An 800-word argument is stretched to 4,000 words of circular repetition.

**Fix:** State the point once, clearly. Support it with specific evidence. Move on. If there's nothing more to add, stop.

---

### 23. Listicle in a trench coat

Numbered items dressed as continuous prose. The model was told not to use lists and instead wrote: "The first thing to understand is... The second important point is... The third consideration involves..."

**Fix:** Either use an actual list, or write actual prose with actual transitions. The disguise is worse than either option.

---

### 24. Historical analogy stacking

Rapid-fire listing of historical companies or technology revolutions to build false authority without actual argument.

**AI pattern:** "Apple didn't build Uber. Facebook didn't build Spotify. Stripe didn't build Shopify. AWS didn't build Airbnb."

**Fix:** Pick the most relevant example and make a specific argument from it. Three examples with real detail beats ten examples with no detail.

---

### 25. Invented concept labels (the "X paradox" pattern)

AI appends abstract problem-nouns to domain words — "supervision paradox," "acceleration trap," "workload creep" — and uses them as if they're established terms. They function as rhetorical shorthand: name a thing, skip the argument.

**Fix:** Either cite an actual established concept, or just describe the thing directly without the invented label.

---

### 26. Dead metaphor repetition

A single metaphor used across an entire piece without variation. Human writers introduce a metaphor, use it, and move on. AI will return to the same metaphor 8–12 times.

**Fix:** After using a metaphor twice, retire it. If you're going to extend it, do so deliberately and briefly.

---

### 27. Short punchy fragment abuse

Excessive very-short sentences used as standalone paragraphs for manufactured emphasis. This is not the same as intentional rhythm variation (which is good). It's an inhuman cadence — no one writes first drafts this way.

**AI pattern:**
"He published this. Openly. In a book. As a priest."

**Fix:** One fragment for emphasis can work. Four consecutive fragments is an AI tell. Consolidate.

---

### 28. Grandiose stakes inflation

Everything is the most important thing ever. A blog post about API pricing becomes a meditation on the future of computing.

**AI patterns:**

- "This will fundamentally reshape how we think about everything."
- "will define the next era of computing"
- "something entirely new in the history of the industry"

**Fix:** Match the claim to the evidence. If the stakes are genuinely high, say specifically why and for whom.

---

### 29. Vague attributions

Attributing claims to unnamed authorities. AI also inflates the quantity — presenting what one person said as a widely held view.

**AI patterns:**

- "Experts argue that..."
- "Industry reports suggest..."
- "Observers have noted..."
- "Several publications have cited..."

**Fix:** Name the expert, name the report, name the publication. If you can't, you don't have a source — you have an assertion. Either find the source or state it as your own view.

---

### 30. Synonym cycling

To avoid repeating a word, AI substitutes synonyms on rotation: "protagonist... main character... central figure... hero." The cycling is more distracting than repetition would be.

**Fix:** Use the clearest word consistently. Repetition is fine. Synonym cycling reads like a thesaurus was involved.

---

## Part 5: Tone patterns

### 31. Promotional tone / tourism writing

LLMs shift into advertisement-like or travel-guide language regardless of topic.

**AI patterns:**

- "nestled in the heart of..."
- "breathtaking views"
- "vibrant community"
- "rich cultural heritage"
- "stunning natural beauty"
- "boasts a range of features"

**Fix:** Neutral, specific description. What is the thing? Where is it? What does it do? Not how impressive it is.

---

### 32. Obsequious chatbot openers

**AI patterns:**

- "Great question!"
- "Absolutely!"
- "Certainly!"
- "You're right that this is a complex topic."
- "That's an excellent point."

**Fix:** Delete. Always. Start with the actual content.

---

### 33. False vulnerability / simulated authenticity

AI performing self-awareness to create false intimacy. Real vulnerability is specific and uncomfortable. AI vulnerability is polished and risk-free.

**AI patterns:**

- "And yes, I'm openly in love with this approach..."
- "And yes, since we're being honest..."
- "This is not a rant; it's a diagnosis."
- "Full transparency..."

**Fix:** Real self-disclosure is specific. "I tried this approach on three client projects and it failed twice" is real. "Full transparency: I find this fascinating" is not.

---

### 34. False suspense setups ("Here's the kicker")

Dramatic setup before a point that doesn't need or justify the buildup.

**AI patterns:**

- "Here's the kicker."
- "Here's the thing."
- "Here's where it gets interesting."
- "Here's what most people miss."
- "But here's the truth."

**Fix:** Make the point. If it needs a setup, the setup should be content, not a meta-announcement.

---

### 35. Futurist invitation ("Imagine a world where...")

AI uses this to sell an argument by front-loading the desired outcome before making the actual case.

**AI pattern:** "Imagine a world where every tool you use has a quiet intelligence behind it..."

**Fix:** Make the argument first. If imagination is genuinely useful for this piece, use it sparingly and ground it in specific detail, not vague aspiration.

---

### 36. "Think of it as..." / patronizing framing

See item 16. The additional tell: AI uses this construction far more than necessary, and often produces analogies that are less clear than the original concept would have been without them.

---

### 37. Em dash overuse

Humans use em dashes occasionally — for genuine mid-sentence interjections. AI uses them constantly. More than 3–4 in a piece is a signal.

**Fix:** Replace most with commas, periods, or parentheses. Keep em dashes only for genuine mid-sentence breaks that can't be handled another way.

---

### 38. Bold overuse in running prose

AI bolds key phrases in running prose as if highlighting a textbook. Human writing doesn't do this. Reserve bold for framework labels in reference docs, genuinely critical warnings, or section callouts — never for emphasis in flowing paragraphs.

---

### 39. Emoji in headers

🚀 **Launch Phase:** / 💡 **Key Insight:** / ✅ **Next Steps:**

This is an AI tell in business and editorial content. Unless the brand voice specifically uses emoji in structural elements, remove them.

---

### 40. Inline-header bullet lists

Every bullet starts with a **bolded header** followed by a colon and explanation. This format dominates unedited AI output and reads as assembled rather than written.

**AI pattern:**

- **Performance:** Performance has been significantly improved...
- **Security:** Security has been substantially enhanced...
- **Usability:** Usability has been meaningfully streamlined...

**Fix:** Convert to prose where possible. Use actual lists only for genuinely parallel, genuinely enumerable items.

---

### 41. Unicode decoration

AI uses special characters that don't result from normal typing: smart/curly quotes, unicode arrows (→), bullet characters pasted as raw unicode. Subtle but visible in raw markup.

---

## Part 6: Composition-level patterns

### 42. Section-ending conclusions and "In summary"

Announcing the conclusion rather than letting it arrive. In academic essays, "In conclusion" is a convention. In any other format, it signals the writer followed a template.

**AI patterns:**

- "In conclusion, the future depends on..."
- "To sum up, we've explored three key themes..."
- "In summary, the evidence suggests..."
- "Overall, this represents..."

**Fix:** End by saying the last thing. Don't announce that it's the last thing.

---

### 43. Formulaic opens

**The most common:**

- "In today's fast-paced world..." (delete and start over)
- "In recent years, X has become increasingly important..." (delete and start with what specifically happened)
- "X is a complex topic." (delete — all topics are complex)

---

### 44. The "Despite its challenges..." boilerplate

An acknowledgment of problems that immediately pivots to optimism, with no specifics on either side.

**Pattern:** "Despite its challenges, [subject] continues to demonstrate its value in [area]."

**Fix:** Name a specific challenge and what specifically addresses it, or don't mention challenges at all.

---

### 45. Unverified precision

AI produces strangely precise numbers with no source trail. "73.4% of Gen Z prefer analog watches." The specificity is meant to signal rigor; the missing citation signals the opposite.

**Fix:** Verify every number. If it doesn't surface from a real source, rewrite or cut.

---

### 46. Notability overclaiming

AI lists media appearances and social following to prove a subject is notable, rather than demonstrating notability through specific facts and actual contributions.

**AI pattern:** "She has been featured in The New York Times, Forbes, and The Atlantic. She maintains an active social media presence with over 500,000 followers."

**Fix:** What did she actually do or say that's worth covering? Lead with that.

---

## Part 7: What "technically clean" writing still gets wrong

Removing AI patterns is half the job. Writing that has no identifiable tells but also has no voice is still obviously not human. Here's what that looks like:

**Signs of soulless writing (even if technically pattern-free):**

- Every sentence is the same length and structure
- No opinions — only neutral reporting
- No mixed feelings, no uncertainty, no acknowledgment that something is hard
- No first-person perspective when it would be natural
- No humor, no edge, no personality
- Reads like a briefing memo or press release
- The writer has no visible relationship to the material

**How to inject voice:**

**Have opinions and state them.** "I genuinely don't know what to make of this" is more human than a balanced pro/con list. React to facts rather than just report them.

**Vary rhythm deliberately.** Short sentences. Then a longer one that works through a secondary point before it lands. Then short again. This mirrors how humans actually think and speak, and it directly addresses the burstiness problem that detectors measure.

**Be specific about uncertainty.** "I'm not sure this will work long-term because the incentives are misaligned in the following specific way..." beats "While there are challenges, the approach shows promise."

**Use first person when appropriate.** "I keep coming back to this question" signals a real person. "One is left to wonder" signals a language model.

**Let some mess in.** An aside that almost doesn't belong. A thought that's half-formed. A "but I'm getting ahead of myself." These signal a human thinking in real time, not text being assembled to specification.

**Dwell on what's interesting and skip what's not.** Show bias. Spend extra space on the part that surprised you or that you find genuinely concerning. Skip through the obligatory parts quickly. Uniform treatment is an AI signature.

**Use concrete specifics that couldn't be generic.** Dollar amounts, specific dates, names of real people with actual quotes, a product version number, a company that stopped existing three years ago. These raise perplexity because a model wouldn't default to them.

---

## Final audit questions

Before sending any draft:

1. Can I read this aloud and would it sound natural?
2. Are there more than 3–4 em dashes?
3. Are there any rule-of-three constructions that don't need to be three?
4. Is there at least one opinion stated as an opinion?
5. Do section lengths vary, or does each one get equal treatment?
6. Is every number, citation, and attributed claim verifiable?
7. Is there a real human behind this — someone with a specific relationship to the material?
8. Does the ending add something, or just restate the beginning?
9. Would a heavy LLM user read this and say "this sounds like ChatGPT"?
10. Would a skilled human editor say this sounds like a specific person?

If the answer to question 9 is yes, keep revising.
If the answer to question 10 is no, keep revising.

Both questions must be satisfied.

---

## Quick reference: Red-flag word list (2025–2026)

**Structure tells:** "It's not X, it's Y" / "The result?" / "Here's the kicker" / "Think of it as" / "Let's dive in" / "In conclusion" / "In summary" / "Despite its challenges" / "Imagine a world where" / "It's worth noting"

**Vocabulary tells:** Additionally, align with, boasts, breathtaking, certainly, commendable, comprehensive, crucial, cutting-edge, delve, elevate, emphasizing, enhance, enduring, foster, groundbreaking, holistic, innovative, intricate, key (adj), landscape (abstract), leverage (verb), meticulous, nestled, paradigm, pivotal, robust, seamless, showcase, streamline, stunning, synergy, tapestry, testament, transformative, underscore, utilize, valuable, vibrant

**Adverb tells:** Deeply (as intensifier), fundamentally (as intensifier), quietly (implying understated power), remarkably, arguably

**Opener tells:** "In today's fast-paced world," / "In recent years," / "It is important to note that" / "Great question!" / "Absolutely!" / "Certainly!"

**Closer tells:** "The future looks bright." / "Exciting times lie ahead." / "This represents a significant step forward." / "The journey continues."

---

## Source foundation

This checklist synthesizes:

- **Wikipedia:Signs of AI Writing** (WikiProject AI Cleanup, updated through 2026)
- **tropes.fyi** by ossama.is — practitioner pattern database
- **Perplexity and burstiness research** — GPTZero methodology, academic studies on human vs. AI text metrics (Kujur 2025, Siddharth 2024)
- **Linguistic marker studies** — DependencyAI (arXiv 2025), EMNLP 2024 detection research
- **University of Helsinki study** (April 2025) — changes in student essays pre/post-ChatGPT
- **blader/humanizer** — Claude Code skill documentation and pattern database
