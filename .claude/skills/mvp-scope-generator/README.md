# MVP Scope Generator

> Generate a comprehensive zero-to-production scope of work from an MVP idea — database schemas, API specs, tech stack, landing page, SEO, marketing, deployment, and launch plan.

## Usage

```
/mvp-scope [file path or description]
```

## What It Does

Takes an MVP idea (from an mvp-idea-generator report, a markdown file, a PDF, or a plain text description) and produces a hyper-specific, actionable scope of work document covering everything from an empty repository to a production deployment generating revenue.

The scope is so detailed that a developer could hand it to a contractor or use it as a personal roadmap and start building immediately — no ambiguity, no TBD placeholders, no generic advice.

### 11 Phases

1. **Research & Context Enrichment** — Fills gaps via WebSearch/WebFetch (tech stack, pricing, SEO, competitors)
2. **Database Architecture** — Complete schemas with columns, types, constraints, relationships, ASCII ERD
3. **Feature & API Specification** — User stories, UI components, API endpoints with request/response schemas, auth, RBAC
4. **Tech Stack & Architecture** — Decision tree-based recommendations with confidence scores (1-25), architecture diagram
5. **Landing Page & Design** — Section-by-section structure with actual headline/body copy
6. **SEO Strategy** — Target keywords, technical SEO checklist, 10 blog post titles, backlink tactics
7. **Marketing & Go-to-Market** — Pre-launch week-by-week plan, launch day hour-by-hour playbook, post-launch monthly plan
8. **Deployment & Infrastructure** — Environments, CI/CD pipeline (GitHub Actions), hosting config, monitoring/alerting
9. **Testing Strategy** — Testing pyramid with specific frameworks, example test cases, pre-launch checklist
10. **Timeline, Costs & Milestones** — Week-by-week Gantt, itemized cost table (month 1-6), milestone definitions
11. **Report Assembly & Quality Check** — Confidence scoring (HIGH/MEDIUM/LOW) per section, quality verification

### Confidence Scoring

Every section gets a confidence badge:
- **HIGH** — Based on verified current data, established patterns
- **MEDIUM** — Reasonable assumptions, may need validation
- **LOW** — Speculative, user should validate

Tech stack recommendations are scored on 5 dimensions (Maturity, DX, Cost, Scalability, Community) for a composite score out of 25.

## Example

```
/mvp-scope ~/reports/mvp-2026-04-10.md

Zero-to-Production Scope of Work

Product: PingBase — API Endpoint Monitor for Indie Devs
Build time: 5 weeks (solo developer)
Month 1 cost: ~$1/mo (free tiers)
Overall confidence: HIGH (4.2/5.0)

Sections:
1. Database Architecture [HIGH] — 11 tables, complete schemas, ERD
2. Feature & API Design [HIGH] — 4 features, 20+ endpoints, RBAC matrix
3. Tech Stack [HIGH] — Next.js + Neon + Clerk + Stripe (scored 18-24/25)
4. Landing Page [HIGH] — Hero copy, pricing cards, FAQ, pre-launch waitlist
5. SEO Strategy [MEDIUM] — 20+ target keywords, 10 blog titles
6. Marketing [MEDIUM] — 4-week pre-launch, launch day playbook
7. Deployment [HIGH] — Vercel + Neon, GitHub Actions CI/CD
8. Testing [HIGH] — Vitest + Playwright, 15-item pre-launch checklist
9. Timeline [HIGH] — 5-week Gantt with 7 milestones
10. Costs [HIGH] — $1/mo at launch, $71/mo at scale
11. Post-Launch [MEDIUM] — Scaling triggers, revenue milestones to $10K MRR
```

## Input Formats

The skill accepts three input formats:

1. **File path** — `.md` or `.pdf` file (e.g., from mvp-idea-generator output)
2. **Raw markdown** — Paste an MVP report directly
3. **Plain description** — Just describe the idea in text

## Dependencies

None — standalone research skill. Uses WebSearch, WebFetch, and Read tools.

## Files

- `SKILL.md` — 11-phase scope generation process
- `references/scope-template.md` — Master output template (11 sections)
- `references/tech-stack-decision-tree.md` — Stack selection framework with 4 templates
- `references/database-patterns.md` — Common SaaS database schemas (auth, billing, audit, etc.)
- `references/seo-marketing-playbook.md` — Launch playbook, community marketing, email sequences
- `references/infrastructure-pricing.md` — Service pricing baselines (hosting, DB, auth, email, etc.)
- `references/confidence-scoring-rubric.md` — Scoring framework for recommendations
- `examples/sample-scope.md` — Complete worked example (PingBase API Monitor)

## Works Great With

- **mvp-idea-generator** — Generate MVP ideas first, then scope the best one
- `/x-thread` — Create a build-in-public launch thread from your scope
- `/x-post` — Announce your build journey
