# MVP Opportunity Scoring Rubric

Score each MVP idea across 7 dimensions. Total possible: **100 points**.

## Dimensions

### 1. Pain Severity (0-20 points)

How intense and frequent is the pain users experience?

| Score | Criteria |
|-------|----------|
| 17-20 | **Critical**: Users actively spending money on broken workarounds. Multiple "I'd pay anything" signals. Daily frustration. Hair-on-fire problem. |
| 13-16 | **High**: Frequent complaints across multiple platforms. Users describe significant time/money waste. Clear emotional language ("hate", "frustrated", "nightmare"). |
| 9-12 | **Moderate**: Regular mentions of the problem. Users have workarounds but find them annoying. Some willingness-to-pay signals. |
| 5-8 | **Mild**: Occasional complaints. Problem exists but users tolerate it. Few explicit payment signals. |
| 1-4 | **Low**: Rare mentions. Nice-to-have, not need-to-have. No evidence of payment willingness. |

### 2. Market Size (0-15 points)

How large is the total addressable market?

| Score | Criteria |
|-------|----------|
| 13-15 | **Large**: Millions of potential users. Billion-dollar TAM. Multiple industries affected. Horizontal SaaS opportunity. |
| 10-12 | **Medium-Large**: Hundreds of thousands of potential users. $100M+ TAM. Clear industry vertical with growth. |
| 7-9 | **Medium**: Tens of thousands of potential users. $10M-$100M TAM. Specific niche but sizeable. |
| 4-6 | **Small**: Thousands of potential users. $1M-$10M TAM. Niche market, but viable for solo/small team. |
| 1-3 | **Tiny**: Hundreds of potential users. <$1M TAM. Very narrow niche, hard to scale. |

### 3. Competition Gap (0-15 points)

How underserved is this space by existing solutions?

| Score | Criteria |
|-------|----------|
| 13-15 | **Wide open**: No direct competitors. Existing solutions are from adjacent categories and poorly adapted. Users resort to spreadsheets/manual processes. |
| 10-12 | **Underserved**: 1-2 competitors but they're overpriced, have poor UX, or miss key features. Strong negative reviews. Clear differentiation opportunity. |
| 7-9 | **Moderate gap**: Several competitors but none dominant. Room for a better/cheaper/simpler alternative. Specific niche underserved within a broader market. |
| 4-6 | **Competitive**: Multiple established players. Differentiation requires significant innovation or niche focus. |
| 1-3 | **Saturated**: Many well-funded competitors with strong products. Very hard to differentiate. Red ocean. |

### 4. Willingness to Pay (0-15 points)

Is there evidence that users will pay for a solution?

| Score | Criteria |
|-------|----------|
| 13-15 | **Strong signals**: Users explicitly mention paying or already paying for inferior solutions. B2B context where ROI is clear. Existing market validates pricing. Budget authority users are complaining. |
| 10-12 | **Good signals**: Users discuss the problem in professional/business contexts. Similar tools are paid successfully. Target users have budgets. |
| 7-9 | **Moderate signals**: Mixed signals. Some free alternatives exist but users express desire for premium features. Target market has some price sensitivity. |
| 4-6 | **Weak signals**: Users expect free solutions. Consumer market with low willingness to pay. Heavy free competition. |
| 1-3 | **No signals**: No evidence of payment willingness. Users only seek free/open-source options. |

### 5. Time to MVP (0-10 points)

Can a solo developer or small team build a functional MVP quickly?

| Score | Criteria |
|-------|----------|
| 9-10 | **Fast (1-3 weeks)**: Simple CRUD app, API wrapper, or automation tool. Well-understood tech stack. No complex integrations. Can ship a landing page + waitlist in days. |
| 7-8 | **Moderate (3-6 weeks)**: Requires some custom logic or a few integrations. Standard web/mobile app with moderate complexity. |
| 5-6 | **Moderate-slow (6-10 weeks)**: Multiple integrations, some custom algorithms, or data pipeline work. Needs careful architecture but doable. |
| 3-4 | **Slow (10-16 weeks)**: Complex system with many moving parts. Requires specialized knowledge (ML, real-time, hardware integration). |
| 1-2 | **Very slow (16+ weeks)**: Massive undertaking. Requires regulatory compliance, complex infrastructure, or deep domain expertise to even launch v1. |

### 6. Path to $10K MRR (0-15 points)

How realistic is reaching $10K MRR within 6-12 months?

| Score | Criteria |
|-------|----------|
| 13-15 | **Clear path**: Only need 50-200 customers at realistic price points ($50-$200/mo). Strong organic channels exist. Similar products have achieved this timeline. Low churn risk. |
| 10-12 | **Viable path**: Need 200-500 customers or higher price points. Good distribution channels available. Some proven playbooks exist. |
| 7-9 | **Possible but challenging**: Need 500-1000 customers or significant sales effort. Requires marketing budget or strong content strategy. |
| 4-6 | **Difficult**: Need 1000+ customers or enterprise sales cycles. High customer acquisition costs. Long sales cycles. |
| 1-3 | **Unlikely in 12 months**: Very high customer volumes needed, or market has long adoption cycles. Requires significant capital. |

### 7. Defensibility (0-10 points)

Can you build a competitive moat over time?

| Score | Criteria |
|-------|----------|
| 9-10 | **Strong moat**: Network effects, proprietary data advantage, deep integrations that create switching costs, regulatory barriers to entry. |
| 7-8 | **Good moat**: Data compounds over time, strong brand potential, integrations create stickiness, community-driven value. |
| 5-6 | **Moderate moat**: First-mover advantage in niche, some switching costs, brand recognition possible. |
| 3-4 | **Weak moat**: Easy to replicate technically. Moat comes mainly from execution speed and customer relationships. |
| 1-2 | **No moat**: Trivially copyable. No data advantage, no network effects, no switching costs. Commodity product. |

---

## Composite Score Calculation

```
Total Score = Pain Severity + Market Size + Competition Gap + Willingness to Pay + Time to MVP + Path to $10K MRR + Defensibility
```

## Score Interpretation

| Band | Score | Action |
|------|-------|--------|
| **Exceptional** | 80-100 | Prioritize immediately. This is a rare, high-confidence opportunity. Start building this week. |
| **Strong** | 65-79 | Serious contender. Worth deep validation and a quick prototype. |
| **Moderate** | 50-64 | Viable if you have domain expertise or unique distribution. Needs extra validation. |
| **Weak** | 35-49 | Significant risks or challenges. Only pursue if you have a specific unfair advantage. |
| **Skip** | 0-34 | Too many red flags. Move on to better opportunities. |

## Scoring Example

**"AI-Powered Invoice Reconciliation for Freelancers"**
- Pain Severity: 15/20 (freelancers frequently complain about invoice tracking, multiple "hate QuickBooks" threads)
- Market Size: 11/15 (60M+ freelancers globally, growing market)
- Competition Gap: 9/15 (QuickBooks, FreshBooks exist but are overbuilt for solo freelancers)
- Willingness to Pay: 12/15 (freelancers already pay for invoicing tools, $10-30/mo range validated)
- Time to MVP: 8/10 (basic invoice tracking + bank matching is achievable in 4 weeks)
- Path to $10K MRR: 11/15 (200 customers at $50/mo = $10K MRR, freelancer communities are reachable)
- Defensibility: 5/10 (data accumulates, but core product is replicable)
- **Total: 71/100 — Strong opportunity**
