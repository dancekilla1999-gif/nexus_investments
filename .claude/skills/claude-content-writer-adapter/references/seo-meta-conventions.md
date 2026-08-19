# SEO and Social Meta Data Conventions

Reference guide for search and social metadata. Covers what the specs actually are in 2025–2026, what Google's behavior looks like in practice, and where to spend your time.

---

## The context you need before writing a single tag

**Google rewrites most of what you write.** In Q1 2025, Google modified 76% of title tags — up from 61% in 2023. When it rewrites, it retains an average of 35% of the original content, removes about 2.7 words, and strips brand names in 63% of cases. Meta descriptions are rewritten 62–87% of the time depending on the study.

**This doesn't mean stop writing them.** It means write them well enough that Google has no reason to change them, and write them so that even a partial rewrite still earns a click. The primary goal of a title tag is CTR, not ranking. The primary goal of a meta description is CTR on the queries where Google preserves your text — which is still a meaningful slice of traffic.

**AI Overviews are eating clicks.** When an AI Overview appears, organic CTR drops 38–61% on that query. Zero-click searches now exceed 60% of all Google searches in the US. This matters for how you approach metadata: the snippet is increasingly a brand impression even when the user doesn't click, not just a traffic driver. Schema markup that gets you cited inside AI Overviews is now worth more than optimizing for traditional position #1.

**Where to invest your time:**

- Title tags: always worth writing carefully (they're a ranking signal and the best single CTR lever you have)
- Meta descriptions: worth writing for high-value pages — product pages, service pages, high-converting blog posts; skip for bulk content Google will rewrite anyway
- Schema: high ROI, especially for AI citations; start with Article, then FAQPage on key pages
- OG/Twitter tags: set once correctly and maintain; wrong images or missing tags cost social sharing performance

---

## Title Tags

### The actual rules in 2025

Google measures in pixels, not characters. The 600-pixel desktop limit translates to roughly 50–60 characters for average-width letters, but "W" takes more space than "i." Use a pixel-width tool (SERPSim or Mangools' SERP Simulator) for precision on important pages. The rule of thumb is 50–60 characters, but the real goal is no truncation.

**The unchanged-title sweet spot:** 84.87% of titles Google leaves unchanged fall in the 30–60 character range. Shorter titles below 20 characters are rewritten 50%+ of the time (Google adds words). Titles over 70 characters are rewritten 99.9% of the time.

**Pipes vs. dashes:** Google replaced the pipe separator (|) 41% of the time and replaced it with a dash. Google only removed dashes 19.7% of the time. Use dashes. `Title - Brand` is more stable than `Title | Brand`.

**Brand names:** Google removes brand names from rewritten titles 63% of the time, especially in health and finance. For YMYL content, consider whether the brand name in the title is actually serving the user or just serving you.

**What prevents rewrites:**

- Title matches the H1 and the primary content of the page
- No keyword stuffing or multiple keyword variants
- Not too short, not too long (30–60 characters)
- Accurately describes what the page delivers
- Includes the current year where relevant (freshness signal)

### Format defaults

- **Length:** 30–60 characters (titles 51–60 chars have the lowest rewrite rate)
- **Structure:** Primary keyword near the front, brand at the end with a dash
- **Include numbers** where honest — they improve CTR and survive rewrites
- **Match the H1** — mismatches between title and H1 are a primary rewrite trigger

### Title patterns that work

**How-to format**

```
How to [Specific Outcome] in [Timeframe] - [Brand]
```

Example: `How to Validate Your MVP in 3 Weeks - Sociilabs`

**Problem/solution**

```
[Problem]: [Solution Outcome] - [Brand]
```

Example: `The $40K MVP Mistake: How to Avoid It - Sociilabs`

**List format**

```
[Number] [Things] to [Outcome] - [Brand]
```

Example: `7 Questions to Ask Before Writing Code - Sociilabs`

**Definitive guide**

```
[Topic]: Complete Guide for [Audience] - [Brand]
```

Example: `MVP Development: Complete Guide for Founders - Sociilabs`

**Negative / what-not-to-do** (outperforms positive framing for high-intent queries)

```
Stop [Doing X]: [What to Do Instead] - [Brand]
```

Example: `Stop Building Before You Validate - Sociilabs`

### What kills title performance

- Pipe separators (41% replacement rate — use dashes)
- Titles over 70 characters (99.9% rewrite rate)
- Same title across multiple pages
- Keyword variants stuffed in ("MVP validation, product validation, startup MVP")
- Title that doesn't match what the page delivers (high bounce signals bad title)
- Boilerplate brand phrases repeated across every page

---

## Meta Descriptions

### What they actually do in 2025

Meta descriptions are not a ranking factor — Google confirmed this in 2009. They influence CTR only when Google preserves your text, which happens roughly 13–38% of the time. When Google rewrites, it pulls from your page content.

**Implication:** Your first 2–3 body paragraphs matter as much as your meta description tag. If the opening content is strong, Google's rewrite will be strong. If it's weak, no meta description saves it.

**When to write them manually:**

- High-value pages (product pages, service pages, key landing pages)
- Brand-new pages Google hasn't indexed enough to generate good snippets from
- Pages where compliance or precision matters (legal, medical)
- Pages with strong commercial intent where you want to control the pitch

**When to skip manual descriptions:**

- Blog archives and tag pages
- Bulk content at scale (the time is better spent on actual content quality)
- Pages where your opening paragraph already answers the query well

### Format defaults

- **Length:** 140–160 characters (descriptions truncate around 920–930 pixels — shorter than you think on mobile)
- **Not a ranking factor** — write for clicks, not for keywords
- **Match search intent** — answer the question the query is asking
- **Include specifics** — numbers, timeframes, outcomes
- **One soft CTA** — "Learn how," "See the framework," not "Click here"

### Meta description patterns

**Problem + solution**

```
[Audience] often [problem]. Here's [specific solution] that [outcome]. [Proof point].
```

Example: `Founders often waste 6 months building the wrong thing. Here's a 3-week framework that validates demand before you write a line of code. Used by 100+ startups.`
(155 chars)

**Value proposition**

```
Learn [specific outcome] with [method]. Includes [what's inside]. [Credibility signal].
```

Example: `Learn to validate your MVP before writing code. Includes interview scripts, landing page templates, and pilot frameworks. Used by 100+ founders.`
(146 chars)

**Question format** (strong for informational intent)

```
[Question your audience asks]? [Brief answer]. [What they'll learn].
```

Example: `Mobile app or web app first? Most startups waste $100K on the wrong choice. Here's the decision framework we use with every client.`
(133 chars)

### What to avoid

- Duplicating the title — write the description as the continuation, not a repeat
- Generic phrases: "Click here to learn more," "Find out everything about"
- Keyword stuffing
- Vague value: "Comprehensive guide to everything you need to know about MVP development"
- Making promises the page doesn't keep (bounces signal bad snippet; Google learns)

---

## Open Graph Tags (Facebook, LinkedIn)

Open Graph tags control the preview when someone shares your URL. Without them, platforms pull random images and truncated text. With them, you control what people see.

### Image dimensions (2025–2026)

The universal safe spec: **1200×630px (1.91:1 ratio)**. This works on Facebook, LinkedIn, and scales acceptably on X/Twitter.

The updated universal spec: **1200×600px (2:1 ratio)**. As of 2025–2026, all major platforms render 2:1 images without cropping. If you're creating one image for all platforms, 1200×600 or 1200×675 are both cleaner than 1200×630, but 1200×630 still works fine.

**LinkedIn cache note:** LinkedIn caches OG data for up to 7 days. After updating, use the LinkedIn Post Inspector to force a refresh. Don't swap images frequently — the cache makes it unreliable.

### Required OG tags

```html
<meta property="og:title" content="The $40K MVP Mistake: How to Validate Before You Build" />
<meta property="og:description" content="Most founders waste 6 months building features nobody wants. Here's the 3-week validation framework we use with every client. Saves $40K+ in unnecessary dev." />
<meta property="og:image" content="https://yourdomain.com/images/mvp-validation-og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Diagram showing 3-week MVP validation process" />
<meta property="og:url" content="https://yourdomain.com/blog/mvp-validation-framework" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Sociilabs" />
```

### OG title guidelines

- **Length:** 60–90 characters (social titles can be longer than SEO titles)
- **Can differ from SEO title** — optimize for the social context, not for Google
- **More conversational** — this is a person sharing something, not a search result
- **Specific over clever** — "3-Week Framework" beats "Our Approach"

### OG description guidelines

- **Length:** 100–200 characters for full visibility (longer text gets cut on mobile)
- **Platform differences:** Facebook shows ~300 chars on desktop; LinkedIn shows less
- **Include social proof** where honest — "Used by 100+ startups" reads as specific, not inflated
- **Avoid generic closers** — "Find out more" adds nothing; end on the specific value

### OG image guidelines

| Spec | Value |
|------|-------|
| Dimensions | 1200×630px (safe) or 1200×600px (cleaner 2:1) |
| Format | JPG for photos; PNG for graphics with text |
| File size | Under 8MB |
| Min size | 600×315px |
| Alt text | Required — describe the image content specifically |

**Image design principles:**

- Text overlay must be readable at thumbnail size — assume 50% of the image will be lost to small-screen rendering
- Keep critical content in the center 60% — edges get cropped on some platforms
- High contrast between text and background — not because it's pretty, because it works in a feed
- Include the key number or outcome from the piece, not generic brand art
- Include logo but don't let it compete with the message

---

## Twitter / X Card Tags

X reads both `twitter:*` tags and OG tags. If your OG tags are set correctly, X will fall back to them for title, description, and image — but you need `twitter:card` explicitly, because there's no OG fallback for card type.

### Card type

Always use `summary_large_image` for blog posts, articles, and landing pages. The small summary card is significantly less engaging in feeds.

### Image dimensions

**Recommended:** 1200×675px (16:9). This matches OG image dimensions, so one image works for all platforms.

**Official 2:1 ratio:** 1200×600px — this is what X's spec says, but 1200×675 displays without cropping.

**Minimum:** 300×157px — below this X falls back to a small summary card.

**Max file size:** 5MB. Formats: JPG, PNG, WebP, GIF (only first frame of animated GIFs).

**Cache:** X caches aggressively. After updating, use the X Card Validator at cards-dev.x.com/validator to force a refresh.

### Required X/Twitter tags

```html
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@yourtwitterhandle" />
<meta name="twitter:creator" content="@authorhandle" />
<meta name="twitter:title" content="The $40K MVP Mistake: How to Validate Before You Build" />
<meta name="twitter:description" content="Most founders waste 6 months on features nobody wants. Here's the 3-week validation framework that saves $40K+ in development." />
<meta name="twitter:image" content="https://yourdomain.com/images/mvp-validation-twitter.jpg" />
<meta name="twitter:image:alt" content="3-week MVP validation timeline" />
```

### Twitter title guidelines

- **Length:** 70 characters max
- **Front-load the hook** — X is a fast-scroll environment; the first few words determine whether someone stops
- **Specific numbers outperform adjectives** — "Saves $40K" beats "Saves significantly"
- **Match the tweet context** — the card appears below the tweet; the title should complement, not repeat

### Twitter description guidelines

- **Length:** 200 characters max (in practice, 130–150 is safer for mobile)
- **One specific outcome or stat** — not a list, not a summary
- **Match the energy of the platform** — direct, not corporate

---

## Schema Markup

### What schema does in 2025–2026

Rich results (the visual enhancements in search — FAQ accordions, star ratings, step-by-step instructions) require schema. But the more important use case in 2025 is AI citations.

Google stated in spring 2025 that structured data is "critical" for AI Overviews because it's "efficient, precise, and easy for machines to process." Pages with FAQ schema appear 2.3x more often in AI-generated answers than pages without. Bing Copilot, ChatGPT, and Perplexity also use structured data as preferred citation sources.

**FAQ rich results restriction (August 2025):** Google now shows FAQ rich results only for high-authority government and health sites. For most sites, FAQ schema no longer generates the accordion display in traditional search results — but it still improves AI citation rates and provides entity context signals.

**HowTo schema:** Rich results now shown on desktop only. Still worth implementing for tutorial content.

### Where to start

1. **Article schema** — all blog posts and editorial content
2. **FAQPage schema** — key blog posts, service pages (for AI citations, not SERP accordions)
3. **Organization schema** — homepage and about page
4. **BreadcrumbList schema** — improves navigation display in SERPs across the site

### Article schema

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "The $40K MVP Mistake: How to Validate Before You Build",
  "description": "Most founders waste 6 months building features nobody wants. Here's the 3-week validation framework we use with every client.",
  "image": "https://yourdomain.com/images/mvp-validation.jpg",
  "author": {
    "@type": "Person",
    "name": "Your Name",
    "url": "https://yourdomain.com/about"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Sociilabs",
    "logo": {
      "@type": "ImageObject",
      "url": "https://yourdomain.com/logo.png"
    }
  },
  "datePublished": "2025-03-15",
  "dateModified": "2025-03-15"
}
```

**Required fields for Article rich results:** `headline`, `image`, `datePublished`, `author`, `publisher`. Missing any of these makes the page ineligible.

### FAQPage schema

Use on blog posts, service pages, and any content where you've included explicit Q&A. The schema provides AI citation signals even if the FAQ accordion no longer renders for most sites.

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How long does MVP validation take?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our 3-week framework includes one week of customer interviews, one week of landing page testing, and one week of paid pilots. This validates ideas before writing a line of production code."
      }
    },
    {
      "@type": "Question",
      "name": "How much does MVP validation cost?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Validation typically costs $5K–$15K depending on scope, compared to $40K–$100K for building a product without validation. The ROI is the cost of a failed product you didn't build."
      }
    }
  ]
}
```

**Rules that matter:**

- Questions and answers must be visible on the page — not hidden in tabs or accordions with `display:none`
- Don't mark up questions that aren't on the page
- Keep answers factual and specific — vague answers get cited less

### HowTo schema

For step-by-step tutorial content. Renders as rich results on desktop. Provides AI citation signals on all platforms.

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to Validate Your MVP in 3 Weeks",
  "description": "A step-by-step framework for validating product ideas before writing code.",
  "totalTime": "PT3W",
  "step": [
    {
      "@type": "HowToStep",
      "name": "Week 1: Customer Interviews",
      "text": "Conduct 20 customer interviews to identify the expensive problem. Focus on their current process, what breaks, and what it costs them in time or money.",
      "url": "https://yourdomain.com/blog/mvp-validation-framework#week-1"
    },
    {
      "@type": "HowToStep",
      "name": "Week 2: Landing Page Test",
      "text": "Build a landing page describing the solution. Drive 100–200 visitors with paid traffic. Target 20%+ email capture as a signal of real demand.",
      "url": "https://yourdomain.com/blog/mvp-validation-framework#week-2"
    },
    {
      "@type": "HowToStep",
      "name": "Week 3: Paid Pilot",
      "text": "Offer to build a basic version for 3–5 customers at a real price (even $500). If nobody pays, you don't have a business problem — you have an interest problem.",
      "url": "https://yourdomain.com/blog/mvp-validation-framework#week-3"
    }
  ]
}
```

### Schema implementation rules

- **JSON-LD only** — it's the format Google recommends and the easiest to audit
- **Mark up only what users can see** — hidden content violates Google's guidelines and can trigger manual actions
- **Use specific types, not generic ones** — `Article` not `WebPage`; `Restaurant` not `LocalBusiness`
- **Validate before publishing** — Google Rich Results Test at search.google.com/test/rich-results
- **Don't duplicate schema types on a single page**
- **Required properties first** — don't add optional fields while required ones are missing

---

## Platform-Specific Notes

### Google Search

- Title and H1 must say the same thing in the same language — mismatches trigger rewrites
- First 2–3 paragraphs of body content are what Google uses when it rewrites your meta description
- Schema is increasingly important for AI Overview citations, not just rich results
- EEAT signals (author credentials, publication dates, organization schema) influence trust

### Facebook

- OG image is the most important element — most users never read the description
- Use the Facebook Sharing Debugger before publishing any high-distribution content
- Don't put the URL in the post body (Facebook penalizes external links in organic posts; put it in comments)
- Image with a clear visual hierarchy and readable text at small sizes outperforms pure photography

### LinkedIn

- LinkedIn caches OG data for up to 7 days — use Post Inspector to force refresh after updates
- Professional imagery only — memes and clickbait are actively penalized by LinkedIn's algorithm
- `og:title` and `og:image` carry the most weight; description is secondary
- The professional credibility of the image matters — generic stock photos underperform branded graphics with data or insight

### Twitter / X

- `twitter:card` is required — there's no OG fallback for card type
- `summary_large_image` is the right choice for almost all content
- X caches aggressively — use the Card Validator at cards-dev.x.com/validator after updates
- 1200×675px works for both X and OG — one image for all platforms

---

## Complete Meta Tag Template

```html
<!-- Primary Meta Tags -->
<title>The $40K MVP Mistake: How to Validate Before You Build - Sociilabs</title>
<meta name="description" content="Most founders waste 6 months building features nobody wants. Here's a 3-week validation framework that saves $40K+ in unnecessary development. Used by 100+ startups." />
<meta name="author" content="Your Name" />

<!-- Canonical URL -->
<link rel="canonical" href="https://yourdomain.com/blog/mvp-validation-framework" />

<!-- Open Graph / Facebook + LinkedIn -->
<meta property="og:type" content="article" />
<meta property="og:url" content="https://yourdomain.com/blog/mvp-validation-framework" />
<meta property="og:title" content="The $40K MVP Mistake: How to Validate Before You Build" />
<meta property="og:description" content="Most founders waste 6 months building features nobody wants. Here's the 3-week validation framework we use with every client. Saves $40K+ in unnecessary development." />
<meta property="og:image" content="https://yourdomain.com/images/mvp-validation-og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="3-week MVP validation framework diagram" />
<meta property="og:site_name" content="Sociilabs" />

<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="https://yourdomain.com/blog/mvp-validation-framework" />
<meta name="twitter:title" content="The $40K MVP Mistake: How to Validate Before You Build" />
<meta name="twitter:description" content="Most founders waste 6 months on features nobody wants. Here's the 3-week validation framework that saves $40K+ in development." />
<meta name="twitter:image" content="https://yourdomain.com/images/mvp-validation-og.jpg" />
<meta name="twitter:image:alt" content="3-week MVP validation framework diagram" />
<meta name="twitter:site" content="@yourtwitterhandle" />
<meta name="twitter:creator" content="@authorhandle" />
```

Note: The same image URL is used for both OG and Twitter tags. One asset, one upload, consistent rendering across Facebook, LinkedIn, and X.

---

## Output format (when generating metadata)

When generating metadata for a piece of content, deliver:

1. **SEO Title** — with character count
2. **Meta Description** — with character count
3. **OG Title** — can differ from SEO title
4. **OG Description** — 100–200 chars
5. **Twitter Title** — 70 chars max
6. **Twitter Description** — 130–150 chars
7. **Image brief** — dimensions, text to include, visual direction
8. **Schema** — Article JSON-LD as a minimum; FAQPage if the piece has Q&A sections; HowTo if step-by-step
9. **Complete HTML block** — copy-paste ready
10. **Variations** — 2 title alternatives for A/B testing if the page is high-value

---

## Testing tools

| What to test | Tool |
|-------------|------|
| Title tag display | SERPSim, Mangools SERP Simulator |
| Facebook/LinkedIn OG preview | Facebook Sharing Debugger (developers.facebook.com/tools/debug) |
| LinkedIn preview + cache clear | LinkedIn Post Inspector (linkedin.com/post-inspector) |
| Twitter/X card preview + cache clear | X Card Validator (cards-dev.x.com/validator) |
| Schema validation | Google Rich Results Test (search.google.com/test/rich-results) |
| Schema syntax | Schema Markup Validator (validator.schema.org) |
| Live search performance | Google Search Console (CTR by query) |

**Workflow for high-value pages:** Write → validate schema → test all OG previews → publish → check Search Console after 2 weeks for CTR vs. impression data.

---

## Shortcode handling

If shortcodes are defined in the user's profile:

- `{{brand_name}}` → company name
- `{{author_name}}` → author name
- `{{twitter_handle}}` → @handle
- Custom shortcodes defined by the user
