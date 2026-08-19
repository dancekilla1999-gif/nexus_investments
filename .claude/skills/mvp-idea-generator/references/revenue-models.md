# SaaS Revenue Models Reference

Use this reference when determining the best revenue model for each MVP idea.

---

## Model Types

### 1. Freemium
**How it works**: Free tier with limited features/usage; paid tiers unlock more.
**Best for**: Products with viral/network potential, low marginal cost per user, large addressable market.
**Typical conversion**: 2-5% free → paid.
**Pricing range**: Free → $10-50/mo (Pro) → $50-200/mo (Team).
**Examples**: Notion, Slack, Figma, Canva.
**When to use**: When the product improves with more users, or when free users generate content/data that attracts paid users.
**When to avoid**: When cost-to-serve free users is high, or market is too small for 2-5% conversion to sustain revenue.

### 2. Usage-Based
**How it works**: Charge based on consumption (API calls, messages sent, storage used, credits).
**Best for**: Developer tools, APIs, infrastructure, AI-powered products with per-request costs.
**Typical expansion**: 120-140% net revenue retention (users grow into higher usage).
**Pricing range**: Pay-as-you-go with minimum, or tiered usage buckets.
**Examples**: Twilio, AWS, OpenAI API, Vercel.
**When to use**: When usage correlates with value delivered, and heavy users should pay more.
**When to avoid**: When users need cost predictability, or usage doesn't correlate with value.

### 3. Per-Seat / Per-User
**How it works**: Charge per team member who uses the product.
**Best for**: Collaboration tools, team productivity, project management.
**Typical range**: $5-30/user/mo (SMB) → $30-100/user/mo (enterprise).
**Examples**: GitHub, Jira, Linear, Asana.
**When to use**: When value scales with team size, and each user gets distinct value.
**When to avoid**: When teams will share accounts to reduce cost, or the product is primarily used by one person.

### 4. Flat-Rate
**How it works**: Single price for full access. Maybe 2-3 tiers by feature set.
**Best for**: Simple products, solo user tools, products where usage is hard to meter.
**Typical range**: $10-100/mo for individuals, $100-500/mo for teams.
**Examples**: Basecamp, Hey.com, Carrd.
**When to use**: When simplicity is a selling point and the product serves a clear use case.
**When to avoid**: When there's high variance in how much value different users get.

### 5. Hybrid (Seat + Usage)
**How it works**: Base per-seat fee plus usage overages.
**Best for**: Products with both collaboration value and variable consumption.
**Typical range**: Base $X/user/mo + $Y per [unit].
**Examples**: HubSpot (seats + contacts), Intercom (seats + conversations).
**When to use**: When you need revenue predictability but also want to capture heavy-use value.

### 6. Marketplace / Transaction Fee
**How it works**: Take a percentage of transactions facilitated through the platform.
**Best for**: Two-sided marketplaces, payment processing, freelancer platforms.
**Typical range**: 5-20% per transaction.
**Examples**: Stripe (2.9%), Gumroad (10%), Upwork (10-20%).
**When to use**: When you facilitate transactions between buyers and sellers.
**When to avoid**: When transaction value is too low to support a fee, or when users can easily bypass the platform.

### 7. One-Time Purchase + Maintenance
**How it works**: Pay once for the product; optional annual maintenance/support fee.
**Best for**: Developer tools, desktop software, self-hosted products.
**Typical range**: $49-499 one-time, with optional $X/year updates.
**Examples**: Tailwind UI, Laravel Forge licenses, Sublime Text.
**When to use**: When users resist subscriptions, or the product doesn't require ongoing infrastructure.
**When to avoid**: When you need predictable recurring revenue, or the product requires continuous investment.

---

## Revenue Model Decision Tree

```
Is the product used by teams?
├── YES → Does value scale linearly per user?
│   ├── YES → Per-Seat pricing
│   └── NO → Flat-rate with team tier
└── NO → Is the product used by individuals?
    ├── YES → Does usage vary significantly between users?
    │   ├── YES → Usage-based or Hybrid
    │   └── NO → Flat-rate or Freemium
    └── Does the product facilitate transactions?
        ├── YES → Marketplace / Transaction fee
        └── NO → Flat-rate or One-time purchase

Additional modifiers:
- If large addressable market + low marginal cost → Add a free tier (Freemium)
- If AI/API with per-request costs → Usage-based is natural
- If target market is developers → Consider one-time + maintenance
- If target market is enterprise → Per-seat with annual contracts
```

---

## Pricing Benchmarks by Market Segment

| Segment | Solo/Freelancer | SMB (1-50) | Mid-Market (50-500) | Enterprise (500+) |
|---------|----------------|------------|---------------------|-------------------|
| Productivity | $5-15/mo | $8-25/user/mo | $15-50/user/mo | Custom |
| Developer Tools | $10-30/mo | $20-50/user/mo | $50-100/user/mo | Custom |
| Marketing/Sales | $15-50/mo | $50-200/mo | $200-1000/mo | Custom |
| Analytics | $0-30/mo | $50-200/mo | $200-500/mo | Custom |
| Communication | $0-10/mo | $5-15/user/mo | $10-25/user/mo | Custom |
| Design | $10-20/mo | $15-30/user/mo | $30-75/user/mo | Custom |
| Finance/Accounting | $10-30/mo | $30-100/mo | $100-500/mo | Custom |
| HR/Recruiting | $20-50/mo | $100-500/mo | $500-2000/mo | Custom |
| Security | $10-25/mo | $50-200/mo | $200-1000/mo | Custom |

---

## Conversion Rate Benchmarks

| Metric | Bottom Quartile | Median | Top Quartile |
|--------|----------------|--------|-------------|
| Free → Paid (Freemium) | 1-2% | 3-5% | 7-10% |
| Trial → Paid (14-day trial) | 10-15% | 20-30% | 40-60% |
| Website visitor → Trial signup | 2-5% | 5-10% | 10-20% |
| Trial → Paid (no credit card upfront) | 5-10% | 10-15% | 20-30% |
| Trial → Paid (credit card required) | 25-40% | 40-60% | 60-80% |
| Monthly → Annual conversion | 15-25% | 30-40% | 50-60% |
| Net Revenue Retention (B2B SaaS) | 90-100% | 100-110% | 120-140% |

---

## $10K MRR Scenarios

Quick reference for how many customers you need at various price points:

| Price/mo | Customers for $10K MRR | Difficulty |
|----------|----------------------|------------|
| $9 | 1,112 | Hard — need high volume |
| $19 | 527 | Moderate — need good funnel |
| $29 | 345 | Moderate — achievable with content marketing |
| $49 | 205 | Good — sweet spot for many SaaS |
| $79 | 127 | Good — B2B friendly |
| $99 | 102 | Great — fewer customers, higher touch |
| $149 | 68 | Great — mid-market positioning |
| $199 | 51 | Excellent — if WTP supports it |
| $299 | 34 | Excellent — premium niche |
| $499 | 21 | Best — but need strong value prop |
