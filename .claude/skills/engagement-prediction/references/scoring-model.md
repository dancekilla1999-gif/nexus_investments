# Engagement Scoring Model Documentation

This document defines the complete scoring model used by the engagement-prediction skill. The model combines structural analysis (automated by the scoring script) with qualitative assessment (applied by Claude) to produce a 0-100 composite score.

## Score Architecture

The total score is the sum of six weighted dimensions:

| Dimension | Max Points | Weight | Primary Signal |
|-----------|-----------|--------|----------------|
| Hook Strength | 20 | 20% | Scroll-stopping power of the first line |
| Reply Potential | 20 | 20% | Likelihood of generating replies (54x algorithm weight) |
| Share Potential | 20 | 20% | Likelihood of retweets and quote tweets (20x weight) |
| Save Potential | 15 | 15% | Likelihood of bookmarks (40x algorithm weight) |
| Algorithm Fit | 15 | 15% | Alignment with X ranking algorithm preferences |
| Audience Match | 10 | 10% | Relevance to the developer/tech audience on X |

The weights are intentionally skewed toward engagement actions (Reply, Share, Save) because these are the signals that X's algorithm uses to determine distribution. Hook Strength gets high weight because without it, no other dimension matters — the tweet never gets read.

## Structural vs. Qualitative Analysis

### Structural Analysis (Script)

The `predict_engagement.py` script detects measurable patterns:
- Character and word count
- Presence of questions, code blocks, lists, numbers
- Hashtag count and external link detection
- Hook pattern matching (contrarian, story opener, data lead, etc.)
- Engagement bait phrase detection
- Developer keyword density for audience matching
- Length optimization against known sweet spots

Structural analysis is objective and reproducible. The same tweet always gets the same structural score.

### Qualitative Analysis (Claude)

Claude layers judgment on top of the structural baseline:
- Is the content genuinely original or a rehash of common advice?
- Does the voice sound authentic or AI-generated?
- Is the timing relevant to current developer conversations?
- Does the opinion have enough substance to generate real debate?
- Is the "value" actually valuable, or is it generic?

Qualitative adjustments are typically plus or minus 1-5 points per dimension. They should never override the structural score entirely, but they refine it.

## Dimension Deep Dives

### Hook Strength (0-20)

The hook is the first line of the tweet — the only part visible before someone decides to read more or scroll past.

**Sub-factors:**

1. **Pattern match (0-8 points):** Does the first line use a proven hook pattern?
   - Contrarian opener ("Unpopular opinion:", "Hot take:"): 8 points
   - Story opener ("I spent 6 months...", "I built...", "I analyzed..."): 7 points
   - Direct command ("Stop using...", "Never..."): 7 points
   - Curiosity gap ("Here's what...", "Here's why..."): 7 points
   - Exclusivity ("Nobody talks about...", "No one mentions..."): 8 points
   - Listicle ("5 things I learned...", "3 mistakes..."): 6 points
   - Data lead ("The #1 reason...", "A study of 10,000..."): 6 points
   - TIL ("Today I learned..."): 5 points
   - Question (ending in ?): 6 points
   - No recognizable pattern: 0 points

2. **Specificity (0-4 points):** Does the first line include specific details?
   - Contains a number or data point: +2 points
   - Names a specific technology, tool, or project: +2 points
   - Generic/vague language: 0 points

3. **Length optimization (0-2 points):** Is the first line concise?
   - First line under 100 characters (fully visible without expansion): +2 points
   - First line 100-140 characters: +1 point
   - First line over 140 characters (gets truncated): 0 points

4. **Qualitative originality (plus or minus 3 points):**
   - Opening feels fresh and you have not seen it worded this way before: +1 to +3
   - Opening uses a tired format or is clearly template-derived: -1 to -3

**Common mistakes that tank Hook Strength:**
- Starting with "I think..." or "In my opinion..." (weak, passive)
- Opening with context or background before the interesting part
- Using the hook pattern but filling it with generic content ("Hot take: testing is important")
- Making the first line a full paragraph that gets truncated in the feed

### Reply Potential (0-20)

Replies are the single most valuable engagement signal in X's algorithm at 54x weight. A tweet that generates even a few genuine replies will significantly outperform one with only likes.

**Sub-factors:**

1. **Question presence (0-8 points):**
   - Direct question asking for personal experience: 8 points
   - Direct question with obvious answer: 4 points
   - Rhetorical question: 2 points
   - No question: 0 points

2. **Opinion strength (0-6 points):**
   - Strong, specific opinion that informed people disagree on: 6 points
   - Mild opinion most would agree with: 2 points
   - No opinion stated: 0 points

3. **Debate invitation (0-4 points):**
   - Compares two popular options (React vs Vue, tabs vs spaces): 4 points
   - Makes a claim with numbers that people will want to fact-check: 3 points
   - Topic is inherently polarizing in dev community: 2 points
   - No debate angle: 0 points

4. **Qualitative assessment (plus or minus 3 points):**
   - Topic genuinely has multiple valid perspectives: +1 to +3
   - Opinion is actually consensus disguised as contrarian: -1 to -3

**Common mistakes that tank Reply Potential:**
- Asking a question so broad nobody knows where to start ("What do you think about coding?")
- Stating an opinion so safe nobody feels the need to respond
- Using engagement bait prompts ("Comment below!") which trigger algorithm suppression
- Making claims so extreme that people disengage rather than debate

### Share Potential (0-20)

Shares (retweets and quote tweets) expand reach beyond your immediate followers. People share content that makes them look knowledgeable, helpful, or aligned with a valuable perspective.

**Sub-factors:**

1. **Social currency (0-6 points):** Does sharing this make the sharer look good?
   - Original data or research others can reference: 6 points
   - Novel framework or mental model: 5 points
   - Curated resource list: 4 points
   - Interesting opinion: 2 points
   - Personal update: 0 points

2. **Quotability (0-5 points):** Can this stand alone without context?
   - Self-contained insight in under 200 characters: 5 points
   - Needs some context but main point is clear: 3 points
   - Requires reading the full thread or knowing the author: 0 points

3. **Practical value (0-5 points):** Is this useful enough to pass along?
   - Contains code, commands, or configurations: 5 points
   - Contains a methodology or process: 4 points
   - Contains a tip or trick: 3 points
   - Commentary only: 0 points

4. **Format (0-4 points):** Is the format shareable?
   - Thread with clear structure: 4 points
   - Single tweet with list format: 3 points
   - Single tweet, clean formatting: 2 points
   - Messy formatting or wall of text: 0 points

**Common mistakes that tank Share Potential:**
- Content that is too personal ("I got promoted today!") — people celebrate but do not share
- Insights that are well-known to the target audience (nothing new to share)
- Content that requires too much context to understand when retweeted
- Threads where individual tweets make no sense out of order

### Save Potential (0-15)

Bookmarks carry 40x weight in the algorithm — the second highest signal. Saved content is content people want to reference again, which signals the algorithm that it has lasting value.

**Sub-factors:**

1. **Reference value (0-5 points):**
   - Code snippet or command worth copying: 5 points
   - Cheat sheet or comparison table: 5 points
   - Tool/resource list: 4 points
   - Single tip worth remembering: 2 points
   - No reference value: 0 points

2. **Actionability (0-5 points):**
   - Step-by-step instructions: 5 points
   - Framework with clear application: 4 points
   - Methodology or process: 3 points
   - Insight without action steps: 1 point
   - Pure opinion: 0 points

3. **Depth (0-3 points):**
   - Goes beyond surface level with nuance and edge cases: 3 points
   - Covers the basics well: 1 point
   - Shallow treatment: 0 points

4. **Qualitative utility (plus or minus 2 points):**
   - You would genuinely bookmark this yourself: +1 to +2
   - The "tips" are obvious or already well-documented elsewhere: -1 to -2

**Common mistakes that tank Save Potential:**
- Promising a "guide" or "framework" but only delivering surface-level advice
- Code snippets with errors or that would not actually work
- Lists of resources without explaining what makes each one worth using
- Time-sensitive content (news, announcements) that expires quickly

### Algorithm Fit (0-15)

This dimension measures how well the tweet's structure aligns with X's known ranking algorithm preferences.

**Sub-factors:**

1. **Length optimization (0-3 points):**
   - 71-240 characters: 3 points (optimal single tweet)
   - 40-70 or 241-280 characters: 2 points
   - Under 40 characters: 0 points (scrolled past too quickly, low dwell time)
   - Thread tweet 150-250 characters each: 3 points

2. **Media presence (0-3 points):**
   - Image or video attached: 3 points
   - Code screenshot: 3 points
   - No media: 0 points

3. **Link handling (0-3 points):**
   - No links: 3 points
   - Link in reply only: 2 points
   - Link in main tweet: 0 points (triggers -5x penalty)

4. **Hashtag discipline (0-3 points):**
   - 0-2 relevant hashtags: 3 points
   - 3 hashtags: 1 point
   - 4+ hashtags: 0 points (each excess gets -10x penalty)

5. **Clean signals (0-3 points):**
   - No engagement bait: 3 points
   - Mild engagement prompt: 1 point
   - Engagement bait detected: 0 points (triggers suppression)

**Common mistakes that tank Algorithm Fit:**
- Including a URL in the main tweet instead of replying with it
- Using hashtags as a discovery strategy (does not work on X anymore)
- Very short tweets ("So true") that generate no dwell time
- Engagement bait ("Like if you agree!") which triggers active suppression

### Audience Match (0-10)

How well the content targets the developer audience on X.

**Sub-factors:**

1. **Technical vocabulary (0-4 points):**
   - Uses specific language/framework names: 4 points
   - Uses general tech terms: 2 points
   - No technical language: 0 points

2. **Pain point relevance (0-3 points):**
   - Addresses a real developer pain point: 3 points
   - Tangentially relevant to dev work: 1 point
   - Not developer-related: 0 points

3. **Community language (0-3 points):**
   - Uses terms and shorthand the dev community recognizes: 3 points
   - Formal or corporate tone: 1 point
   - Marketing or sales language: 0 points

**Common mistakes that tank Audience Match:**
- Writing about development in a way that targets managers, not developers
- Using corporate jargon instead of dev community language
- Content that is broadly tech-adjacent but does not speak to practitioners
- Generic productivity advice that is not specific to the developer workflow

## Score Interpretation Guide

| Range | Label | What It Means |
|-------|-------|---------------|
| 85-100 | Excellent | Top 5% content. High probability of exceeding normal reach by 5-10x. Has viral mechanics built in. Post with confidence. |
| 70-84 | Strong | Top 15% content. Will outperform your average tweet significantly. Minor tweaks could push it to excellent. |
| 55-69 | Good | Above median performance expected. Solid content but missing one or two elements that would make it exceptional. |
| 40-54 | Below Average | Will perform at or slightly below your typical engagement. Has identifiable weaknesses worth fixing before posting. |
| 25-39 | Weak | Will underperform. Multiple dimensions need work. Consider a significant rewrite rather than minor edits. |
| 0-24 | Poor | Fundamental issues with the content, targeting, or structure. Start over with a different angle or format. |

## How to Improve Each Dimension

### Improving Hook Strength
- Lead with the most surprising or counterintuitive element
- Use numbers in the first line ("I spent 200 hours...", "After 50,000 tests...")
- Keep the first line under 100 characters
- Test your hook: read only the first line and ask "would I click 'Show more'?"

### Improving Reply Potential
- End with a specific, answerable question
- Make a claim that has a valid counter-argument
- Compare two things the audience has opinions about
- Share a result that people will want to validate against their own experience

### Improving Share Potential
- Include original data, benchmarks, or measurements
- Create a framework with a memorable name
- Make it quotable — would this work as a standalone insight?
- Add a visual or diagram that summarizes the core idea

### Improving Save Potential
- Include working code snippets (tested, not pseudocode)
- List specific tools with one-line descriptions of what makes each useful
- Provide step-by-step instructions someone could follow right now
- Add edge cases or "watch out for" notes that show depth

### Improving Algorithm Fit
- Remove external links from the main tweet (put them in a reply)
- Drop hashtags to 2 or fewer
- Aim for 71-240 characters on single tweets
- Attach an image or code screenshot
- Avoid any phrasing that reads as engagement bait

### Improving Audience Match
- Name specific technologies, not general categories
- Reference the developer workflow (PRs, deploys, debugging, reviews)
- Use community shorthand (DX, LGTM, YAGNI, RTFM)
- Address a problem developers face this week, not abstractly
