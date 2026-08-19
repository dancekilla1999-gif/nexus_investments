# Confidence Scoring Rubric

Use this framework to assign confidence levels throughout the scope document. Confidence scoring builds trust by being transparent about what's verified vs. assumed.

---

## Section-Level Confidence

Assign one of three confidence levels to each major section header:

### HIGH Confidence
Display as: **[Confidence: HIGH]**

Criteria (must meet ALL):
- Based on verified current data (WebSearch/WebFetch confirmed in this session)
- Uses established, well-documented patterns with extensive community validation
- Pricing verified from official sources
- Approach has been proven by many similar products

Examples:
- Database schema using standard PostgreSQL patterns -> HIGH
- Stripe integration following official docs -> HIGH
- Tech stack recommendation verified with current benchmarks -> HIGH

### MEDIUM Confidence
Display as: **[Confidence: MEDIUM]**

Criteria (meets ANY):
- Based on reasonable assumptions from general knowledge, not freshly verified
- Uses patterns that are well-known but specifics may vary by use case
- Pricing based on reference data (infrastructure-pricing.md) not freshly fetched
- Approach is sound but alternatives may be equally valid
- Market/competitor data from general knowledge, not current research

Examples:
- SEO keyword estimates without search volume data -> MEDIUM
- Cost projections beyond month 3 -> MEDIUM
- Marketing timeline based on typical patterns -> MEDIUM

### LOW Confidence
Display as: **[Confidence: LOW]**

Criteria (meets ANY):
- Speculative or based on limited/no data
- Market assumptions that need user validation before acting
- Pricing estimates that could not be verified at all
- Novel approach without extensive precedent
- Predictions about user behavior or market response

Examples:
- Revenue projections beyond month 6 -> LOW
- Specific user acquisition numbers -> LOW
- Feature prioritization for v1.1+ without user feedback -> LOW

---

## Tech Stack Confidence Score (Per-Component)

Score each recommended tool/service across 5 dimensions, each rated 1-5:

### Dimension Definitions

| Dimension | 1 (Weak) | 2 (Below Avg) | 3 (Average) | 4 (Strong) | 5 (Excellent) |
|-----------|----------|--------------|-------------|------------|--------------|
| **Maturity** | <1 year old, alpha/beta | 1-2 years, limited production use | 2-4 years, growing adoption | 4-7 years, widely used in prod | 7+ years, battle-tested at scale |
| **Developer Experience** | Poor docs, no examples, breaking changes | Sparse docs, few tutorials | Decent docs, active community | Great docs, many tutorials, good error messages | Excellent docs, large community, IDE support, great DX |
| **Cost Efficiency** | No free tier, expensive from day 1 | Limited free tier (<1 month useful) | Adequate free tier for MVP phase | Generous free tier, 3-6 months free | Very generous free tier, scales affordably |
| **Scalability** | Will need full migration at moderate scale | Significant refactoring needed | Handles moderate scale with some tuning | Handles high scale with standard patterns | Handles massive scale natively, auto-scaling |
| **Community/Docs** | <500 GitHub stars, few resources | 500-2K stars, some blog posts | 2K-10K stars, active forums | 10K-30K stars, conferences, plugins | 30K+ stars, major conferences, rich ecosystem |

### Score Calculation

**Composite Score** = Sum of all 5 dimensions (range: 5-25)

### Score Interpretation

| Range | Label | Badge | Guidance |
|-------|-------|-------|---------|
| **21-25** | Strong Recommend | **[STRONG]** | Use with high confidence. Industry-proven choice. |
| **16-20** | Recommend | **[RECOMMENDED]** | Good choice with minor caveats. Solid for MVP. |
| **11-15** | Acceptable | **[ACCEPTABLE]** | Works but consider alternatives. Document trade-offs. |
| **6-10** | Caution | **[CAUTION]** | Significant risks. Only if no better alternative exists. Explain clearly. |
| **1-5** | Avoid | **[AVOID]** | Too risky for MVP. Recommend alternative. |

### Example Scoring

| Tool | Maturity | DX | Cost | Scale | Community | Total | Label |
|------|----------|-----|------|-------|-----------|-------|-------|
| Next.js 15 | 5 | 5 | 5 | 4 | 5 | **24/25** | STRONG |
| Drizzle ORM | 3 | 4 | 5 | 4 | 3 | **19/25** | RECOMMENDED |
| Neon | 3 | 4 | 4 | 4 | 3 | **18/25** | RECOMMENDED |
| Clerk | 3 | 5 | 4 | 4 | 3 | **19/25** | RECOMMENDED |
| Stripe | 5 | 5 | 3 | 5 | 5 | **23/25** | STRONG |
| Resend | 2 | 5 | 4 | 3 | 2 | **16/25** | RECOMMENDED |

---

## Cost Estimate Confidence

For every dollar amount in the scope, assign one of:

| Level | Display | Criteria | Action |
|-------|---------|----------|--------|
| **Verified** | (verified) | Price confirmed via WebFetch on official pricing page during this session | Use as-is |
| **Referenced** | (referenced) | Price from infrastructure-pricing.md reference doc, not freshly verified | Note "verify current pricing" |
| **Estimated** | (estimated) | Price inferred from similar services or general knowledge | Note "verify before budgeting" |

### Example Usage in Cost Tables

| Service | Monthly Cost | Confidence | Notes |
|---------|-------------|-----------|-------|
| Vercel Pro | $20/mo | (verified) | Fetched from vercel.com/pricing |
| Neon Launch | $19/mo | (referenced) | From pricing reference, verify current |
| Custom monitoring | ~$15/mo | (estimated) | Based on similar services |

---

## Overall Confidence Score

Calculate the weighted average across all sections:

```
Overall = (Section_1_score * weight_1 + Section_2_score * weight_2 + ...) / total_weight
```

Where:
- HIGH = 5 points
- MEDIUM = 3 points
- LOW = 1 point

And weights reflect implementation criticality:
- Database Architecture: weight 5
- Feature/API Spec: weight 5
- Tech Stack: weight 4
- Deployment: weight 4
- Testing: weight 3
- Landing Page: weight 3
- SEO: weight 2
- Marketing: weight 2
- Timeline: weight 3
- Costs: weight 3
- Post-Launch: weight 2

**Score interpretation**:
- 4.0-5.0: **HIGH overall** -- Scope is well-researched, can build with confidence
- 2.5-3.9: **MEDIUM overall** -- Scope is reasonable, validate flagged sections
- 1.0-2.4: **LOW overall** -- Scope needs significant validation before building

---

## When to Upgrade Confidence

During scope generation, you can upgrade a section's confidence by:
1. **Verifying pricing**: WebFetch the pricing page -> upgrade cost estimates from Referenced to Verified
2. **Confirming patterns**: WebSearch for current best practices -> upgrade from MEDIUM to HIGH
3. **Finding precedent**: Discover similar successful products using the same approach -> upgrade to HIGH

## When to Downgrade Confidence

Downgrade when:
1. **WebSearch returns outdated results**: Tool might be sunset or pricing changed
2. **Conflicting information**: Multiple sources disagree
3. **Assumptions about user behavior**: Any prediction about adoption/conversion
4. **Timeline depends on unknowns**: Team availability, learning curve, scope creep
