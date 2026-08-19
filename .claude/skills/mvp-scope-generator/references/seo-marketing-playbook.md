# SaaS SEO & Marketing Playbook

Actionable tactics for launching and growing a SaaS MVP. Use these patterns to fill the SEO and Marketing sections of the scope document.

---

## Part 1: SEO Fundamentals for SaaS

### Page Types & Their SEO Purpose

| Page Type | Target Keywords | SEO Purpose |
|-----------|---------------|-------------|
| Homepage | Brand name, primary category | Brand authority, main landing |
| Features pages | "[feature] tool", "[feature] software" | Feature-specific organic traffic |
| Pricing page | "[product category] pricing", "cheap [category]" | High-intent comparison shoppers |
| Blog posts | Long-tail keywords, tutorials | Organic traffic, backlinks, authority |
| Comparison pages | "[competitor] alternative", "[A] vs [B]" | Capture competitor search traffic |
| Use case pages | "[industry] [solution]", "[role] tools" | Vertical-specific traffic |
| Changelog | Product name + updates | Freshness signals, returning visitors |
| Docs/Help | "[product] how to [action]" | Support queries, long-tail |
| Landing pages | Campaign-specific keywords | Paid + organic campaign targets |

### Technical SEO by Framework

#### Next.js (App Router)
```typescript
// app/layout.tsx - Root metadata
export const metadata: Metadata = {
  metadataBase: new URL('https://yourdomain.com'),
  title: { default: 'Product Name', template: '%s | Product Name' },
  description: 'Your product description under 160 chars',
  openGraph: { type: 'website', locale: 'en_US', siteName: 'Product Name' },
  twitter: { card: 'summary_large_image', creator: '@handle' },
  robots: { index: true, follow: true },
}

// app/sitemap.ts - Dynamic sitemap
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getBlogPosts()
  return [
    { url: 'https://yourdomain.com', lastModified: new Date(), priority: 1 },
    { url: 'https://yourdomain.com/pricing', lastModified: new Date(), priority: 0.8 },
    ...posts.map(post => ({
      url: `https://yourdomain.com/blog/${post.slug}`,
      lastModified: post.updatedAt,
      priority: 0.6,
    }))
  ]
}

// app/robots.ts
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/', '/dashboard/'] },
    sitemap: 'https://yourdomain.com/sitemap.xml',
  }
}
```

#### Remix
```typescript
// app/root.tsx
export const meta: MetaFunction = () => [
  { title: 'Product Name' },
  { name: 'description', content: 'Description' },
  { property: 'og:title', content: 'Product Name' },
]

// app/routes/sitemap[.]xml.tsx
export const loader = async () => {
  const content = generateSitemap()
  return new Response(content, { headers: { 'Content-Type': 'application/xml' } })
}
```

#### SvelteKit
```typescript
// src/routes/+layout.svelte or +page.svelte
<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
</svelte:head>
```

### Schema.org Markup Templates

#### SoftwareApplication (Homepage/Product page)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "{product_name}",
  "description": "{description}",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": "0",
    "highPrice": "{max_price}",
    "priceCurrency": "USD",
    "offerCount": "{num_plans}"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "{rating}",
    "ratingCount": "{count}"
  }
}
```

#### FAQPage (FAQ section)
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{question}",
      "acceptedAnswer": { "@type": "Answer", "text": "{answer}" }
    }
  ]
}
```

### Content Templates

#### "[Competitor] Alternative" Page
```
H1: Best {Competitor} Alternative for {Target Audience} in {Year}
H2: Why {Target Audience} Are Switching from {Competitor}
  - Pain point 1 with {Competitor}
  - Pain point 2 with {Competitor}
H2: How {Your Product} Solves These Problems
  - Feature comparison table
H2: Feature Comparison: {Your Product} vs {Competitor}
  - Detailed table with checkmarks
H2: Pricing Comparison
  - Side-by-side pricing
H2: What Customers Say
  - Testimonials or review quotes
H2: Ready to Switch?
  - CTA with migration guide offer
```

#### "Best [Category] Tools" Listicle
```
H1: {N} Best {Category} Tools for {Audience} in {Year}
Intro: Brief overview, selection criteria
H2: 1. {Your Product} - Best for {specific use case}
  - Overview, key features, pricing, pros/cons
H2: 2. {Competitor 1} - Best for {use case}
  - Same structure
...
H2: How to Choose the Right {Category} Tool
  - Decision criteria
H2: FAQ
```

#### "How to [Solve Problem]" Tutorial
```
H1: How to {Solve Specific Problem} in {Year} ({N} Methods)
Intro: The problem, why it matters, what you'll learn
H2: Method 1: {Manual Approach}
  - Step-by-step
H2: Method 2: Using {Your Product}
  - Step-by-step with screenshots
  - This should be the easiest/best method
H2: Method 3: {Alternative}
  - Step-by-step
H2: Comparison: Which Method Is Right for You?
  - Table comparing effort, cost, reliability
CTA: Try {Your Product} free
```

---

## Part 2: Launch Marketing Playbook

### ProductHunt Launch Checklist

**2+ Weeks Before**:
- [ ] Create a Ship page on ProductHunt (collects followers for launch notification)
- [ ] Identify a Hunter with 1000+ followers (optional but helpful)
- [ ] Prepare assets: logo (240x240), gallery images (1270x760), GIF/video demo
- [ ] Write tagline (<60 chars), description, and first comment
- [ ] Prepare a "thank you" response template for comments
- [ ] Line up 10-20 supporters to upvote and comment at launch

**1 Week Before**:
- [ ] Finalize all ProductHunt assets
- [ ] Draft announcement tweets/posts for launch day
- [ ] Set up a launch-day monitoring dashboard
- [ ] Prepare email to waitlist announcing the launch
- [ ] Create a special offer for ProductHunt visitors (extended trial, discount)

**Launch Day (Best: Tuesday-Thursday)**:
- [ ] Publish at 12:01 AM PT (ProductHunt resets daily)
- [ ] Post first comment immediately (tell the story: why you built this, who it's for)
- [ ] Send email to waitlist + supporters
- [ ] Post on X, LinkedIn, Reddit (r/SaaS, r/startups, relevant niche subs)
- [ ] Respond to every ProductHunt comment within 1 hour
- [ ] Share progress updates throughout the day
- [ ] Post a "thank you" update in the evening

**Day After**:
- [ ] Follow up with everyone who commented
- [ ] Write a "ProductHunt launch retrospective" blog post
- [ ] Reach out to new users for feedback

### Community Marketing Targets

#### Reddit
- **General SaaS**: r/SaaS, r/startups, r/Entrepreneur, r/SideProject
- **Tech**: r/webdev, r/programming, r/javascript, r/selfhosted
- **Niche**: Find 3-5 subreddits specific to your product category
- **Rules**: Never hard-sell. Provide value first. Use "Show HN"-style posts in r/SideProject. Comment on relevant threads naturally. Build karma before posting.
- **Cadence**: 1-2 genuine comments/day, 1 post/week max

#### Hacker News
- **Show HN**: `Show HN: {Product Name} - {one-liner}`. Keep it technical and honest.
- **Best time**: 9-11 AM ET on weekdays
- **Engagement**: Respond to every comment. Be humble. Acknowledge competitors.
- **Don't**: Ask for upvotes, post multiple times, be salesy

#### IndieHackers
- **Milestone posts**: Share revenue milestones ($0->$100, first customer, $1K MRR)
- **Build logs**: Regular updates on progress
- **Best approach**: Be transparent about numbers and decisions
- **Engage**: Comment on other makers' posts daily

#### Dev.to / Hashnode
- **Cross-post**: Technical blog content from your main blog
- **Tutorials**: "How to build X with Y" using your product
- **Series**: Multi-part technical content builds following

#### X (Twitter)
- **Build in public**: Share metrics, decisions, wins/fails
- **Engage**: Reply to indie hackers, SaaS founders, potential users
- **Content mix**: 80% value/engagement, 20% product mentions
- **Use threads**: For detailed stories and tutorials

#### LinkedIn
- **Best for B2B**: Share professional insights, company updates
- **Format**: Short paragraphs, line breaks, personal tone
- **Engage**: Comment on industry posts from potential customers

### Build-in-Public Playbook

**What to share**:
- Weekly revenue/user metrics (actual numbers build trust)
- Technical decisions and trade-offs
- Feature launches and customer reactions
- Failures and what you learned
- Behind-the-scenes of building

**What NOT to share**:
- Customer data or private conversations
- Security vulnerabilities or infrastructure details
- Negativity about competitors (focus on your strengths)

**Posting cadence**:
- X: 1-2 posts/day, 1 thread/week
- LinkedIn: 2-3 posts/week
- IndieHackers: 1 milestone update/week
- Blog: 1 post/week

**Templates**:
```
Week {N} update:
- MRR: $X (+$Y from last week)
- Users: X (+Y)
- What I built: {feature}
- What I learned: {lesson}
- Next week: {plan}
```

### Email Marketing for SaaS

#### Welcome Sequence (Immediately after signup)
```
Email 1 (Immediate): Welcome + Quick Start
- Subject: "Welcome to {Product} - Here's how to get started in 2 minutes"
- Content: 3-step quick start, link to first action

Email 2 (Day 1): Value Prop + Key Feature
- Subject: "Did you know {Product} can {key benefit}?"
- Content: Highlight #1 feature with use case

Email 3 (Day 3): Social Proof
- Subject: "How {Customer} solved {problem} with {Product}"
- Content: Brief case study or testimonial

Email 4 (Day 7): Check-in + Upgrade
- Subject: "How's it going with {Product}?"
- Content: Ask for feedback, mention premium features
```

#### Onboarding Drip (Triggered by activation events)
```
Trigger: User creates account but doesn't complete setup (24h)
- Subject: "Need help setting up {Product}?"
- Content: Common setup issues, link to docs, offer for call

Trigger: User completes first core action
- Subject: "Nice! You just {completed action} - here's what's next"
- Content: Next steps, advanced features

Trigger: User hits usage limit on free plan
- Subject: "You're growing! Here's how to unlock more"
- Content: Upgrade CTA with specific benefits
```

#### Churn Prevention Triggers
```
Trigger: User hasn't logged in for 7 days
- Subject: "We miss you at {Product}"
- Content: What's new, reminder of value

Trigger: User downgraded or canceled
- Subject: "Sorry to see you go - quick question?"
- Content: One-question survey, offer for extension/discount

Trigger: Payment failed
- Subject: "Action needed: Update your payment method"
- Content: Direct link to update, grace period info
```

---

## Part 3: Growth Tactics by Stage

### Stage 1: Pre-Revenue ($0 MRR)
- Focus: Build waitlist, validate demand
- Channels: X build-in-public, Reddit, landing page SEO
- Budget: $0 (all organic)
- Key metric: Waitlist signups

### Stage 2: Early Revenue ($0-$1K MRR)
- Focus: Get first 10-50 paying customers
- Channels: ProductHunt launch, HN Show, direct outreach, content marketing
- Budget: $0-100/mo (domain, email tool)
- Key metric: Activation rate, MRR growth

### Stage 3: Traction ($1K-$5K MRR)
- Focus: Find repeatable acquisition channel
- Channels: Double down on what works, start SEO content, consider light paid ads
- Budget: $100-500/mo
- Key metric: CAC, LTV:CAC ratio

### Stage 4: Growth ($5K-$10K MRR)
- Focus: Scale acquisition, reduce churn
- Channels: Content marketing at scale, paid ads (Google, LinkedIn for B2B), partnerships
- Budget: $500-2000/mo (10-20% of revenue)
- Key metric: Net revenue retention, CAC payback period
