# Twitter / X Content Conventions

Reference for generating tweets and threads.
Every guideline reflects current algorithm behavior based on X's open-sourced
ranking code, Buffer's 18.8M-post analysis, and Sprout Social's 2-billion-
engagement dataset (2025–2026).

---

## The platform reality you need to know first

X has changed structurally in ways that make pre-2024 playbooks wrong.

**The link penalty is real and severe.**
X's open-sourced algorithm code confirms a 30–50% reach reduction for posts
containing external links. Buffer's analysis of 18.8 million posts found that
since March 2025, link posts from free (non-Premium) accounts have collapsed
to zero median engagement — effectively invisible. Premium accounts still see
reach on link posts (~0.25–0.3%), but they still underperform text and video.
The standard workaround: post the link in the first reply to your own tweet.
Never in the body if you want reach.

**Engagement velocity in the first hour is everything.**
The algorithm distributes your post to a small test audience and measures
response speed. Tweets that accumulate engagement quickly in the first 30–60
minutes get pushed to wider audiences. A tweet with 100 likes in 10 minutes
outperforms one with 500 likes over 3 days. This makes *when* you post almost
as important as *what* you post.

**Replies beat retweets beat likes — by a large margin.**
From the open-sourced ranking weights: a reply that gets a reply from the
author is worth +75 in algorithm scoring. A like is worth +0.5. That's 150x
more valuable. Retweets score roughly 20x the weight of a like. Implications:
replying to your own replies in the first hour is the highest-leverage activity
on the platform. Chasing likes is optimizing for the wrong signal.

**Text-only posts outperform video on X.**
X is the only major social platform where text beats video in median engagement
rate. Text posts hit ~0.9% median engagement for Premium accounts, ~0.4% for
free accounts. Native video is second (~0.7% Premium). Links are last and, for
free accounts, effectively zero. The counterintuitive rule: write well, publish
text, get reach.

**Premium is a structural advantage, not optional.**
Buffer's analysis found Premium accounts get ~10x more reach per post than free
accounts. Premium replies appear higher in conversation threads. Link posts
remain viable for Premium; for free accounts they're dead. If X is meaningful
to your strategy, treating Premium as optional means accepting a 10x reach
disadvantage.

**Grok AI now powers content ranking.**
X's ranking system uses Grok to read and assess every post for sentiment,
relevance, and quality. Constructive tone is rewarded; content that generates
mass mutes, blocks, or reports faces catastrophic penalties (reports trigger
-369x weights in the ranking code). Being provocative is fine; being polarizing
enough to generate blocks is not.

---

## Single Tweet

### Format defaults

- **Length:** 70–100 characters for maximum reach. Shorter tweets are easier
  to quote-tweet, which carries 20x the algorithmic weight of a like.
  Under 280 characters is the hard limit; optimal is far shorter.
- **No links in body:** Place links in the first reply. Link in the body = 30–50%
  reach penalty for any account; zero engagement for free accounts.
- **No hashtags in body text:** 1–2 hashtags maximum, placed at the end or
  in a reply. 3+ hashtags reduce engagement by ~21%. X's algorithm now uses
  semantic embeddings for topic classification — hashtags are a diminishing
  ranking signal, and overuse reads as spam.
- **Hook-first:** The first line is the only line most people read before
  deciding to engage. Lead with the most interesting part — the insight,
  the number, the contrarian claim. No setup, no context-setting, no preamble.
- **Line breaks:** 1–2 strategic breaks for visual breathing room. Not every
  tweet needs them, but walls of text in mobile feeds perform worse.

### Structure patterns

**Pattern 1: Specific insight + concrete implication**

```
Most founders waste $40K on infrastructure they'll rebuild in 6 months.

Start with managed services. Scale to custom when revenue justifies it.
```

**Pattern 2: Contrarian take with a specific reason**

```
Your MVP doesn't need real-time features.

Async + polling works fine until 10K users.
Don't optimize for scale you don't have yet.
```

**Pattern 3: Specific scenario (story in 3 lines)**

```
Client came to us after spending 8 months building a platform.

Zero users. Zero revenue. Beautiful code nobody wanted.

We start with a landing page and 50 customer conversations.
```

**Pattern 4: Framework tease (earns replies and quote-tweets)**

```
3 questions we ask before writing any code:

1. Who will pay for this?
2. What's the smallest version they'd pay for?
3. Can we build it in 6 weeks?

Saves months of wasted development.
```

**Pattern 5: Observation + question (earns replies)**

```
Noticed: founders who obsess over the pitch deck
always underinvest in the sales process.

What's the actual conversion rate on your last 10 demos?
```

### Voice on X

X has a distinct register from any other content format. The difference:

- **Shorter sentences.** Full stop. Then the next thought.
- **More direct.** Eliminate hedges, qualifiers, setup. Get to the claim.
- **Opinionated.** The algorithm rewards strong takes. "I think" is fine;
  "could potentially be considered" is not.
- **Specific numbers over vague claims.** "$40K" beats "expensive." "8 months"
  beats "a long time." Numbers signal honesty and stop the scroll.
- **First person.** "We see this constantly" > "This is commonly observed."
  The former sounds human; the latter sounds like content.

**When adapting longer content to a tweet:**

1. Find the single most provocative or useful claim
2. Strip every qualifier
3. Add the most specific number available
4. Cut everything else
5. Read it aloud — if it sounds like a slide deck, rewrite it

### Engagement: what actually works

**Reply to your own replies immediately.** A reply that gets a reply from the
author is weighted 150x more than a like in X's ranking code. When someone
replies to your tweet, responding creates a conversation signal that dramatically
amplifies the original post. Budget 10–15 minutes after every tweet for this.

**Quote-tweet with added value, not agreement.** Quote-tweeting someone with
a specific insight or counter-example is weighted 20x more than a like and
signals original thinking. "This" and "Great point" are engagement-bait and
read as filler.

**Ask questions only when genuinely useful.** Empty "What do you think?"
questions generate low-quality replies that don't create conversation depth.
Ask a question that requires a real answer: "What's your conversion rate on
demos?" > "Do you agree?"

**Tag people only when directly relevant.** Tagging for visibility is
recognizable and resented. Tag when you're quoting their work, crediting
their idea, or they're directly in the conversation.

---

## Thread

### When to use a thread vs. a single tweet

A thread is justified when:

- The topic has a clear multi-step structure that can't be collapsed into one tweet
- Each individual tweet can stand alone and deliver value
- The hook tweet is strong enough to earn engagement on its own

Do not thread just to thread. If a single tweet covers it, use one tweet.
Artificial thread-padding signals you have less to say than you're implying.

### Format defaults

- **Length:** 6–8 tweets is the documented optimal range. Threads over 10–12
  risk losing readers unless the content is genuinely exceptional. Threads
  average 63% higher engagement than single tweets when quality is comparable
  — the format signals depth, which attracts serious readers.
- **First tweet is standalone.** Most people never click through. The hook
  tweet must deliver value or a compelling enough claim by itself to justify
  engagement before the thread is read. If the hook doesn't work alone, the
  thread doesn't work.
- **Number every tweet.** "1/7" in each tweet helps readers track progress
  and signals there's more coming. It's not mandatory but reduces drop-off.
- **Do not open with "Thread 🧵" or "A thread on..."** Start the thread.
  The content declares itself. Announcing "thread" is filler that costs you
  the first impression.
- **One idea per tweet.** Not two. Not one-and-a-half. Each tweet in the body
  should be extractable — someone who screenshots tweet 4 from your thread
  should be able to share it independently and have it make complete sense.
- **Link in final tweet, or first reply.** Never in the hook tweet. Links in
  the hook kill reach; by the final tweet, the algorithm has already measured
  your engagement velocity and distributing the thread further. Add it at the
  end.

### Structure

**Tweet 1: Hook**
The thread lives or dies here. Must make a specific, concrete claim, reveal
a surprising insight, or promise something the reader needs to see the rest
to get. Be specific: "I spent 5 years testing every productivity system. Only
one actually worked." is a hook. "A thread on productivity" is not.

Do not be vague. Do not tease without delivering. If the hook implies something,
the rest of the thread must deliver it.

**Tweets 2–3: Problem / context**

- Why this matters to the reader specifically
- What the common mistake or misconception is
- One specific example or case study reference (name the company, the number,
  the outcome — don't say "one client" if you can say "a fintech client in
  Lagos with 40 employees")

**Tweets 4–N: Framework / solution**

- One step, insight, or finding per tweet
- Specific over general: "Run 20 customer interviews in week one. Ask only
  three questions: what's broken, how expensive is it, what's your workaround."
  — not "talk to customers."
- Use → for sub-points within a tweet when you have 2–3 tightly related items
- Metrics when available. Numbers stop the scroll.

**Second-to-last tweet: Proof**

- One specific outcome with a real number
- "We did X, got Y" format
- Attributed as specifically as possible without violating client confidentiality

**Final tweet: Takeaway + optional CTA**

- Restate the core insight in a single sentence
- CTA is optional and should be soft: "DM me if this is your situation"
  outperforms "book a call at [link]" in terms of reply signals
- Link here if relevant (see link-in-reply note above)
- Do not end with "End of thread." — just end.

### Thread example

```
Tweet 1/7:
Most SaaS founders waste 6 months building features nobody wants.

Here's the validation framework we use to know in 3 weeks instead:

Tweet 2/7:
The problem: founders confuse "people said they'd use it" with validation.

Validation = money or time invested. Everything else is politeness.

Tweet 3/7:
Our 3-week sprint:

Week 1: 20 customer interviews
Week 2: Landing page + waitlist
Week 3: Paid pilot with 3–5 customers

Tweet 4/7:
Week 1 — interviews.

Goal: find the expensive problem. Not validate your solution.

Ask:
→ What's your current process?
→ What breaks?
→ What does that cost you?

Tweet 5/7:
Week 2 — landing page.

Describe the solution. Drive 100–200 visitors via paid or organic.

Target: 20%+ email capture. Below that, the problem isn't painful enough.

Tweet 6/7:
Week 3 — paid pilot.

Offer to build a basic version for 3–5 customers. Charge something. Even $500.

If nobody will pay, you don't have a business yet.

Tweet 7/7:
Real outcome: a compliance automation tool we validated this way.

→ 18 interviews
→ 34% waitlist conversion
→ 4 paid pilots at $2K each

Saved 4 months of speculative development.

Full case study in the reply.
```

---

## Publishing and timing

### When to post

Multiple major studies converge on the same pattern for B2B and professional content:

| Source | Best times | Worst |
|--------|-----------|-------|
| Sprout Social (2B engagements) | 12–6 PM, Tue–Thu | Saturday |
| Buffer (8.7M tweets) | 9 AM Tuesday; 9–10 AM Wed | Saturday, Friday |
| General consensus | Tue–Thu, 9 AM–3 PM target timezone | Saturday |

**The nuance:** Sprout Social's 2026 data — based on nearly 2 billion engagements from 307,000 profiles — shows afternoon (12–6 PM) outperforming morning for overall engagement, while Buffer's analysis of 8.7M tweets shows morning (9 AM) as the single highest-performing window. The difference likely reflects audience type: B2B morning, B2C/general afternoon.

**Use your own analytics.** Both studies agree: the best time for your specific account is when *your* audience is online. Check your analytics for peak impression times and calibrate to that, not to industry averages.

**The 30-minute rule.** Whatever time you choose, be available to respond to replies for the first 30–60 minutes. Reply engagement in that window is the primary signal to the algorithm. Posting and leaving is posting into a void.

### Publishing threads

- Write all tweets before posting the first one
- Post tweet 1
- Reply to tweet 1 with tweet 2, reply to that with tweet 3, etc.
- Complete the thread within 3–5 minutes (appears complete; algorithm treats
  rapid completion as intentional rather than abandoned)
- Stay in the replies for 20–30 minutes after posting to respond to early
  engagement — this is the highest-leverage window

### Hashtags

- 0–2 hashtags maximum. Place at the end or in a reply to the final tweet.
- Research confirms 1–2 hashtags provide ~21% higher engagement; 3+ reads
  as spam and underperforms.
- X's algorithm uses semantic embeddings for topic classification, not hashtag
  matching — hashtags are a diminishing signal. They help reach; they don't
  replace content quality.
- Avoid generic high-volume hashtags (#marketing, #success) — they attract
  noise, not your audience.

---

## Format performance reference

Based on Buffer's 18.8M-post analysis of 71,000 X accounts (2025):

| Format | Free account engagement | Premium engagement | Notes |
|--------|------------------------|-------------------|-------|
| Text-only | ~0.40% | ~0.90% | Only platform where text outperforms video |
| Native video | ~0.25% | ~0.70% | Must be uploaded directly to X (not YouTube links) |
| Images | ~0.20% | ~0.40–0.50% | Memes, infographics, data visuals perform well |
| Links | ~0.00% | ~0.25–0.30% | Zero median for free accounts since March 2025 |

**The counterintuitive finding:** X is the only major social platform where
text-only posts outperform video. Write well, publish text, earn engagement —
native video comes second. External video links are penalized like any other
external link.

**Native video when using it:**

- Upload directly to X (not a YouTube link)
- Under 60 seconds gets the largest distribution bonus
- Videos reaching 50%+ completion earn extended reach
- Always include captions — mobile viewing is majority audio-off

---

## What to avoid

### AI tells on X

Short-form writing amplifies AI tells because there's no room to hide them.
These patterns are identifiable at a glance:

- Em dashes (—) in tweets — use periods or line breaks instead
- "Delve," "landscape," "crucial," "robust," "seamless," "foster"
- Triple anaphora ("We need... We need... We need...")
- Emoji headers (🚀 **Key Point:**)
- Throat-clearing ("Here's the thing:" / "Let me be clear:")
- Inspirational vagueness ("The future is bright!")
- Rule of three everywhere (two is often cleaner)
- Negative parallelism ("It's not X — it's Y") — the single most-identified AI
  tell in short-form content

### Engagement-bait patterns

X's Grok-powered ranking detects and deprioritizes engagement manipulation:

- "Retweet if you agree" / "Like this if..."
- Empty questions designed to force agreement ("This or that?")
- "This will get me canceled but..." artificial controversy
- "Nobody talks about this" when the thing is widely talked about
- Posting low-quality content at high volume to game velocity signals
- Hashtag stuffing

Accounts that generate mass mutes, blocks, or reports face -369x penalties in
the ranking algorithm. Being controversial enough to spark debate is fine.
Being polarizing enough to generate blocks is algorithmically catastrophic.

### Format mistakes

- Threading a single idea that fits in one tweet
- Opening with "Thread 🧵" instead of the actual hook
- Putting the link in the hook tweet instead of the reply
- Ending threads with "End of thread" — just end
- Posting and leaving — the first 30 minutes of reply engagement is everything
- Using external video links (YouTube) instead of native uploads

---

## X Premium: the structural reality

X Premium ($8–16/month depending on tier) provides documented algorithmic advantages:

- **~10x more reach per post** than free accounts (Buffer, 18.8M posts)
- **Reply prioritization:** Premium replies appear higher in conversation threads,
  creating compounding discovery in replies to large accounts
- **Viable link posts:** Still penalized relative to other formats, but not zero
  — essential if sharing links is part of your content
- **Extended posts:** Up to 25,000 characters (turns X into a micro-blogging
  platform for long-form publishing)
- **Edit window:** Up to 1 hour post-publication
- **Early engagement boosts:** In-network content receives 4x the weight,
  out-of-network 2x

**Decision framework:** If you post more than 10 times/month AND X is a
meaningful part of your strategy, the 10x reach differential makes Premium
the default choice. At $8–16/month, the break-even against any organic reach
goal is low. For accounts where X is experimental or infrequent, free is fine.

---

## Adapting other content to X

### From blog post or article

1. Find the single most counterintuitive claim in the piece
2. Find the most specific number that supports it
3. Write one tweet: that claim + that number, in 70–100 characters
4. If the depth warrants it, thread the supporting evidence
5. Link goes in the reply to the hook tweet, not the body

Don't summarize. Find the tweet-worthy insight and build around that one thing.

### From case study or client outcome

1. State the result first: "Client saved $40K and 4 months with this approach."
2. Follow with the problem: what they were doing before
3. Follow with the method: what changed
4. Keep each step to one tweet if threading

### From personal experience or observation

The highest-performing original content on X tends to be:

- Specific things learned from specific situations
- Counterintuitive observations from real work (not "in general," but "on this
  project, what we found was...")
- Data from your own business that others in your industry don't share publicly
- Honest mistakes and what they taught you

Generic advice is everywhere. Specific experience isn't.

---

## Shortcode handling

If the user has defined shortcodes in their profile:

- `{{booking_link}}` → Adapt to X's character limit; use in first reply,
  not tweet body
- `{{case_study:name}}` → Link in first reply; reference in body as "full
  case study in the reply"
- `{{cta:soft}}` → Twitter CTAs should be conversational: "DM me if this
  is your situation" or "Full breakdown in the reply" — not formal booking
  language

---

**Sources:** X open-source ranking code (GitHub: xai-org), Buffer 18.8M-post
analysis (2025), Sprout Social 2-billion-engagement dataset (Nov 2025–Feb 2026,
307,000 profiles), Buffer 8.7M-tweet timing analysis, Hashmeta algorithm
analysis (ranking weights), OpenTweet algorithm breakdown (April 2026).
