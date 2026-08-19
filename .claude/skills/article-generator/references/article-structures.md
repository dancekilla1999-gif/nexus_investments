# Article Structures Reference

Detailed templates for each of the six article types supported by the Article Generator skill. Use these structures as blueprints when generating content. Adjust word counts based on topic complexity, but stay within the recommended ranges to maintain reader engagement.

---

## General Principles Across All Structures

**Paragraph length**: Keep paragraphs to 2-4 sentences in the body and 1-2 sentences in technical sections. Long paragraphs cause readers to skim or abandon the article on mobile devices.

**Header hierarchy**: Use H2 for major sections and H3 for subsections. Never skip levels (do not go from H2 to H4). Headers should be descriptive enough that a reader scanning only headers understands the article's flow.

**Code example placement**: Place code examples immediately after the explanation they illustrate, not before. The reader needs context before code. Each code block should be preceded by a sentence explaining what the code does and followed by a sentence explaining the expected outcome.

**Transition phrases**: Connect sections with forward-looking transitions rather than backward-looking summaries. Instead of "Now that we've covered X," use "With X in place, the next step is Y." This maintains momentum.

---

## 1. Technical Tutorial Structure

### Section Breakdown

#### Hook Paragraph
- **Word count**: 50-100 words
- **Goal**: State the problem and the outcome in concrete terms
- **Must include**: What the reader will build, the primary keyword, a hint at the result
- **Tone**: Direct, slightly urgent, practical
- **Example header**: None (this is the opening paragraph, no header needed)

#### Why This Matters
- **Word count**: 100-150 words
- **Goal**: Justify the reader's time investment
- **Must include**: Current relevance (a trend, a common pain point, a new release), who benefits most, what happens if you ignore this
- **Header suggestion**: "Why [Topic] Matters Right Now" or "Why You Should Care About [Topic]"
- **Transition to next section**: End with "Here's what you'll need to follow along." or "Before we start building, let's make sure you have the right setup."

#### Prerequisites
- **Word count**: 50-75 words
- **Goal**: Set expectations and prevent frustration
- **Format**: Bulleted list with version numbers and links
- **Must include**: Language/runtime version, required tools or libraries, assumed prior knowledge
- **Header suggestion**: "Prerequisites" or "What You'll Need"
- **Transition**: "With that in place, let's start building."

#### Step-by-Step Implementation
- **Word count**: 400-800 words total (varies by complexity)
- **Goal**: Walk the reader from zero to a working result
- **Format**: Numbered steps (Step 1, Step 2, etc.) with H3 headers
- **Each step must include**:
  - A descriptive header: "Step 3: Connect the Database" not "Step 3"
  - 1-2 sentences of explanation before the code
  - A complete, runnable code block with syntax highlighting
  - 1 sentence after the code explaining the expected output or result
- **Code guidelines**:
  - Include all necessary imports at the top of the first code block
  - Show file paths in comments if the reader needs to know where to create files
  - Use realistic variable names and data, not foo/bar/baz
  - If a code block is long (30+ lines), add inline comments for key sections
- **Step complexity**: Each step should introduce one concept or change. If a step requires more than 30 lines of new code, consider splitting it into two steps.
- **Header suggestions**: "Step N: [Action Verb] [Object]" — "Step 1: Initialize the Project", "Step 2: Define the Data Model"
- **Transitions between steps**: "Now that [previous result], we can [next action]." or "The [previous component] is ready. Next, we'll [next action]."

#### Common Pitfalls
- **Word count**: 100-200 words
- **Goal**: Save the reader from known failure modes
- **Format**: Bulleted list, 3-5 items, each with bold title
- **Each item structure**: **Problem title** — symptom the reader might see, followed by the cause and the fix in 1-2 sentences
- **Header suggestion**: "Common Pitfalls" or "Watch Out For These"
- **Transition**: "Avoiding these issues puts you in good shape. Let's wrap up with the key points."

#### Key Takeaways
- **Word count**: 75-100 words
- **Goal**: Reinforce the most important lessons
- **Format**: Numbered or bulleted list, 3-4 items
- **Each item**: One sentence, actionable, starting with an action verb
- **Header suggestion**: "Key Takeaways"

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Direct the reader's next action
- **Options**: Try it yourself, extend the project, share your results, read a related article
- **Tone**: Encouraging, not salesy
- **Header suggestion**: "What's Next" or "Try It Yourself"

---

## 2. Deep Dive / Explainer Structure

### Section Breakdown

#### Hook
- **Word count**: 50-100 words
- **Goal**: Create intellectual curiosity
- **Must include**: A surprising fact, a misconception to debunk, or a question worth investigating
- **Tone**: Intriguing, slightly provocative
- **Techniques**: "Most developers assume X. They're wrong." or "Every time you run [common command], here's what actually happens."

#### Background / Context
- **Word count**: 150-200 words
- **Goal**: Provide only the context needed to understand the deep dive
- **Must include**: The relevant history or ecosystem context, definitions of non-obvious terms, the scope of what the article will and will not cover
- **Header suggestion**: "Background" or "Setting the Stage"
- **Pitfall to avoid**: Do not let this section become a Wikipedia summary. Every sentence should directly serve the main explanation.
- **Transition**: "With that context, let's look at how [topic] actually works."

#### How It Actually Works
- **Word count**: 500-800 words
- **Goal**: Build genuine understanding layer by layer
- **Format**: 3-5 subsections (H3), each adding a layer of depth
- **Subsection progression**:
  1. The simplified mental model (what most developers think happens)
  2. What actually happens (the first layer of reality)
  3. The interesting edge cases or nuances (the "aha" moments)
  4. How this connects to things the reader already knows
- **Code and diagram guidelines**:
  - Use code examples to demonstrate behavior, not just syntax
  - Include ASCII diagrams for flows, architectures, or data structures
  - Annotate diagrams with brief labels
  - Show "before and after" examples when explaining transformations
- **Header suggestions**: "The Mental Model", "What's Really Happening", "Where It Gets Interesting"
- **Transitions**: "This explains the common case. But what happens when [edge case]?" or "That's the simplified version. The reality is more nuanced."

#### Implications
- **Word count**: 100-200 words
- **Goal**: Connect understanding to practice
- **Must include**: How this knowledge changes decision-making, what assumptions the reader should revisit
- **Header suggestion**: "What This Means in Practice" or "The Implications"

#### What This Means for You
- **Word count**: 100-150 words
- **Goal**: Personalize the takeaway
- **Format**: 2-3 concrete action items or perspective shifts
- **Header suggestion**: "What to Do With This Knowledge"
- **Transition**: "If you want to explore further, here's where to go next."

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Point to further exploration
- **Options**: Experiment to try, source code to read, related deep dive topics

---

## 3. Opinion / Hot Take (Long-form) Structure

### Section Breakdown

#### Bold Thesis
- **Word count**: 75-100 words
- **Goal**: State the position unambiguously in the very first paragraph
- **Must include**: The specific claim, who it applies to, and a hint at the evidence
- **Tone**: Confident, direct, not aggressive or dismissive
- **Test**: If no reasonable person would disagree, the thesis is too weak. Rewrite.
- **Technique**: "I believe [specific claim], and after [evidence basis], I'm more convinced than ever. Here's why."

#### Supporting Evidence — Point 1
- **Word count**: 150-250 words
- **Goal**: Present the strongest argument
- **Must include**: A concrete example with names, numbers, or code
- **Header suggestion**: A declarative statement summarizing the point, not a question
- **Transition**: "That's the technical argument. But there's a practical dimension too."

#### Supporting Evidence — Point 2
- **Word count**: 150-250 words
- **Goal**: A different type of evidence (if Point 1 is technical, Point 2 is experiential or data-driven)
- **Must include**: A real-world example or data point
- **Header suggestion**: Another declarative statement
- **Transition**: "These two factors alone make the case. But there's a third angle worth considering."

#### Supporting Evidence — Point 3
- **Word count**: 150-200 words
- **Goal**: A forward-looking or broader perspective argument
- **Can be**: A trend analysis, a prediction, or a principle-based argument
- **Header suggestion**: Declarative statement

#### Anticipated Counterarguments
- **Word count**: 150-200 words
- **Goal**: Demonstrate intellectual honesty and strengthen the overall argument
- **Format**: Address 2-3 counterarguments, each in a short paragraph
- **Technique**: "The strongest objection to this position is [counterargument]. This is a fair point, and in [specific context], I'd agree. However, [rebuttal]."
- **Header suggestion**: "The Counterarguments" or "Where This Breaks Down"

#### Conclusion
- **Word count**: 75-100 words
- **Goal**: Restate the thesis strengthened by the evidence
- **Must not**: Simply repeat the introduction. Add synthesis.
- **Header suggestion**: "The Bottom Line"

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Invite genuine discussion
- **Tone**: Curious, not defensive

---

## 4. Listicle / Resource Guide Structure

### Section Breakdown

#### Hook
- **Word count**: 50-100 words
- **Goal**: Explain the curation criteria and set expectations
- **Must include**: The number of items, what they have in common, what problem they solve
- **Tone**: Helpful, authoritative

#### Curated Items
- **Word count**: 75-150 words per item, 500-1200 words total
- **Goal**: Provide enough detail for each item that the reader can decide whether to explore it
- **Each item structure**:
  - **H3 header**: "N. [Item Name] — [One-line Description]"
  - **Why it's good**: 1-2 sentences on specific strengths
  - **When to use it**: 1 sentence on the ideal use case
  - **Code example or key link**: A short snippet (5-15 lines) or a URL
  - **Caveat**: 1 sentence on a limitation or gotcha
- **Ordering**: By impact (highest first) or by logical progression (simplest to most advanced), never alphabetically
- **Grouping**: If 8+ items, use H2 subgroups (e.g., "Development Tools", "Testing Tools", "Deployment Tools")

#### Summary
- **Word count**: 75-100 words
- **Goal**: Identify patterns across items and suggest where to start
- **Header suggestion**: "Where to Start" or "The Pattern"

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Invite contributions and sharing

---

## 5. Case Study / Postmortem Structure

### Section Breakdown

#### Context / Setup
- **Word count**: 100-150 words
- **Goal**: Help the reader gauge relevance to their own situation
- **Must include**: System scale, team size, technology stack, timeframe
- **Header suggestion**: "The Setup" or "Context"
- **Tone**: Factual, neutral

#### The Problem
- **Word count**: 100-200 words
- **Goal**: Make the problem visceral and relatable
- **Must include**: Specific symptoms, how the problem was discovered, the impact
- **Techniques**: Include timestamps, error messages, or metric screenshots if available
- **Header suggestion**: "The Problem" or "What Went Wrong"
- **Transition**: "We tried several approaches before finding one that worked."

#### What We Tried
- **Word count**: 200-300 words
- **Goal**: Document the investigation process, including dead ends
- **Format**: Chronological or by approach, with clear labels for each attempt
- **Each attempt**: Hypothesis (1 sentence), what we did (2-3 sentences), result (1 sentence)
- **Header suggestion**: "What We Tried" or "The Investigation"
- **Why dead ends matter**: Readers learn as much from failures as successes. Do not skip approaches that did not work.

#### What Worked
- **Word count**: 200-300 words
- **Goal**: Document the solution with enough detail to replicate
- **Must include**: The approach, the implementation, and why it succeeded where others failed
- **Code/diagram guidelines**: Include the key code change or architecture diagram. Focus on the delta, not the entire system.
- **Header suggestion**: "The Solution" or "What Finally Worked"

#### Results with Metrics
- **Word count**: 100-150 words
- **Goal**: Quantify the impact
- **Format**: Before/after comparison, ideally in a table or structured list
- **Must include**: The specific metrics that improved, by how much, and over what timeframe
- **Header suggestion**: "Results"

#### Lessons Learned
- **Word count**: 100-200 words
- **Goal**: Extract transferable principles
- **Format**: Numbered list, 3-5 items
- **Each item**: One sentence principle + one sentence explanation
- **Header suggestion**: "Lessons Learned" or "What We'd Do Differently"

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Invite questions and shared experiences

---

## 6. Career / Developer Insights Structure

### Section Breakdown

#### Personal Story Hook
- **Word count**: 100-150 words
- **Goal**: Establish credibility and create emotional engagement through specificity
- **Must include**: A specific moment, with enough sensory or contextual detail that the reader can picture it
- **Tone**: Vulnerable, honest, not self-aggrandizing
- **Technique**: Start in media res. Drop the reader into the moment before providing context.
- **Avoid**: "I've been a developer for N years" openings. Start with action.

#### The Lesson / Insight
- **Word count**: 150-200 words
- **Goal**: Articulate the core insight clearly
- **Must include**: The insight stated plainly, why it is non-obvious, what common assumption it challenges
- **Header suggestion**: A statement of the insight itself, not "The Lesson"
- **Transition**: "I've seen this pattern play out multiple times since then."

#### Supporting Examples
- **Word count**: 200-300 words
- **Goal**: Demonstrate that the insight is not a one-time occurrence
- **Format**: 2-3 examples, each in its own paragraph
- **Each example**: Different context (different company, different role, different technology) but same underlying pattern
- **Header suggestion**: "Where I've Seen This Play Out" or use individual example titles

#### Actionable Advice
- **Word count**: 150-200 words
- **Goal**: Give the reader something to do starting today
- **Format**: 3-5 specific actions in a numbered or bulleted list
- **Each action**: Specific enough to execute without further research. Include the what, when, and how.
- **Header suggestion**: "What You Can Do About It" or "Try This"
- **Test**: If the advice could apply to any topic (like "practice more"), it is too vague. Rewrite.

#### Call to Action
- **Word count**: 50-75 words
- **Goal**: Build community around the topic
- **Tone**: Warm, inviting, reflective
- **Technique**: Ask the reader a specific question about their own experience
