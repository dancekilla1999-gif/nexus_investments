# Infrastructure & Service Pricing Reference

**Important**: Always verify current pricing with WebSearch/WebFetch during scope generation. This file serves as a baseline fallback. Mark any pricing sourced from this file as **[Confidence: MEDIUM]**.

**Last baseline update**: 2026-04

---

## Hosting Platforms

| Service | Free Tier | Starter | Pro | Best For | Notes |
|---------|-----------|---------|-----|----------|-------|
| **Vercel** | 100GB bandwidth, 100GB-hrs serverless | Hobby: $0 | Pro: $20/user/mo | Next.js, frontend | Best Next.js DX, preview deploys |
| **Railway** | $5 free credits/mo | Usage-based (~$5-15/mo) | Usage-based | Backend APIs, databases | Simple PaaS, good for Node/Python |
| **Render** | Free static sites, 750hrs free web service | Starter: $7/mo | Standard: $25/mo | General web apps | Free tier sleeps after 15min inactivity |
| **Fly.io** | 3 shared VMs (256MB), 3GB storage | Usage-based (~$5-15/mo) | Usage-based | Edge/global deployment | Great latency, more DevOps needed |
| **Cloudflare Pages** | Unlimited sites, 500 builds/mo | Free | Pro: $20/mo | Static sites, JAMstack | Excellent free tier |
| **AWS Amplify** | 12-month free tier | ~$5-15/mo | Varies | AWS ecosystem | More complex, enterprise path |
| **DigitalOcean App Platform** | 3 static sites | Basic: $5/mo | Pro: $12/mo | Simple deployments | Good value, straightforward |

**Recommendation for MVP**: Vercel (for Next.js) or Railway (for standalone backends).

---

## Databases

| Service | Free Tier | Starter | Pro | Best For | Notes |
|---------|-----------|---------|-----|----------|-------|
| **Neon** (PostgreSQL) | 0.5 GB storage, 1 project, 10 branches | Launch: $19/mo (10GB) | Scale: $69/mo | Serverless PostgreSQL | Branching, autoscaling, great DX |
| **Supabase** (PostgreSQL) | 500 MB, 2 projects, 50K MAU auth | Pro: $25/mo (8GB) | Team: $599/mo | Full-stack BaaS | Auth + Realtime + Storage included |
| **Turso** (LibSQL/SQLite) | 9 GB, 500 databases | Scaler: $29/mo | Custom | Edge SQLite | Embedded replicas, edge-first |
| **PlanetScale** (MySQL) | No free tier (deprecated) | Scaler: $39/mo | Custom | MySQL workloads | MySQL only, branching |
| **MongoDB Atlas** | 512 MB (M0) | M2: $9/mo | M10: $57/mo | Document-heavy apps | Avoid for relational SaaS |
| **Upstash** (Redis) | 10K commands/day, 256MB | Pay-as-you-go | $10-100/mo | Caching, rate limiting, queues | Serverless, per-request pricing |
| **Railway PostgreSQL** | Included in $5 credits | Usage-based | Usage-based | Bundled with Railway hosting | Simple, no separate service |

**Recommendation for MVP**: Neon (best serverless PostgreSQL) or Supabase (if you want auth/storage bundled).

---

## Authentication

| Service | Free Tier | Starter | Pro | Best For | Notes |
|---------|-----------|---------|-----|----------|-------|
| **Clerk** | 10,000 MAU | Pro: $25/mo + $0.02/MAU | Business: $99/mo | Best DX, pre-built UI | Webhooks, organizations, MFA |
| **Auth.js** (NextAuth) | Unlimited (self-hosted) | Free (OSS) | Free (OSS) | Full control, no vendor lock | More setup work, flexible |
| **Supabase Auth** | 50,000 MAU | Included in Supabase plan | Included | Supabase users | Row Level Security integration |
| **Firebase Auth** | Unlimited (most providers) | Pay-as-you-go for phone/SAML | Custom | Google ecosystem | Generous free tier |
| **Lucia** (deprecated) | Free (OSS) | Free (OSS) | Free (OSS) | Lightweight custom auth | Being sunset, use Auth.js |
| **WorkOS** | 1M MAU (AuthKit) | Free | Enterprise: custom | Enterprise SSO (SAML/SCIM) | Best for B2B enterprise |

**Recommendation for MVP**: Clerk (fastest to implement) or Auth.js (free, more control).

---

## Email Services

| Service | Free Tier | Starter | Pro | Best For | Notes |
|---------|-----------|---------|-----|----------|-------|
| **Resend** | 3,000 emails/mo, 1 domain | Pro: $20/mo (50K) | Business: $100/mo | Modern DX, React Email | Best developer experience |
| **Postmark** | 100 emails/mo | $15/mo (10K) | $65/mo (50K) | High deliverability | Best deliverability rates |
| **SendGrid** | 100 emails/day | Essentials: $19.95/mo (50K) | Pro: $89.95/mo | High volume | Established, marketing features |
| **AWS SES** | 3,000/mo (from EC2) | $0.10/1K emails | Same | Cheapest at scale | More setup, less DX |
| **Mailgun** | 100 emails/day (trial) | $35/mo (50K) | $90/mo (100K) | API-first email | Good API, decent DX |
| **Loops** | 1,000 contacts | Starter: $49/mo | Growth: $99/mo | SaaS email marketing | Built for SaaS onboarding/marketing |

**Recommendation for MVP**: Resend (transactional) + Loops or Buttondown (marketing/newsletter).

---

## Payment Processing

| Service | Pricing | Best For | Notes |
|---------|---------|----------|-------|
| **Stripe** | 2.9% + $0.30/txn | Standard SaaS billing | Industry standard, best docs, Checkout + Billing Portal |
| **Lemon Squeezy** | 5% + $0.50/txn | Simplicity, tax handling | Merchant of record, handles VAT/sales tax |
| **Paddle** | 5% + $0.50/txn | EU compliance | Merchant of record, handles invoicing |
| **Stripe + Merchant of Record** | Varies | US + global | Use Stripe for US, Paddle/LS for global tax |

**Recommendation for MVP**: Stripe (lowest fees, best docs). Consider Lemon Squeezy if you don't want to handle tax compliance.

---

## Monitoring & Error Tracking

| Service | Free Tier | Starter | Best For | Notes |
|---------|-----------|---------|----------|-------|
| **Sentry** | 5K errors/mo, 10K replays | Team: $26/mo | Error tracking | Best error tracking, framework SDKs |
| **BetterStack** (formerly BetterUptime) | 5 monitors, 3-min checks | $24/mo (10 monitors) | Uptime monitoring | Clean UI, status pages |
| **Axiom** | 500 GB ingest/mo | $25/mo | Log aggregation | Generous free tier for logs |
| **Checkly** | 5 checks, 1-min intervals | Starter: $30/mo | Synthetic monitoring | E2E monitoring with Playwright |
| **Grafana Cloud** | 10K metrics, 50GB logs | Pro: $29/mo | Full observability | Open-source based, powerful |
| **Datadog** | Free trial only | Pro: $15/host/mo | Enterprise monitoring | Expensive, overkill for MVP |

**Recommendation for MVP**: Sentry (errors) + BetterStack or Checkly (uptime).

---

## Analytics

| Service | Free Tier | Starter | Best For | Notes |
|---------|-----------|---------|----------|-------|
| **PostHog** | 1M events/mo, 5K recordings | $0 (generous free) | Product analytics | Session replay, feature flags, A/B tests |
| **Plausible** | None (self-host free) | $9/mo (10K pageviews) | Privacy-focused web analytics | GDPR-compliant, no cookie banner needed |
| **Vercel Analytics** | Included in Vercel plan | Included | Basic web vitals | Limited but free if on Vercel |
| **Google Analytics** | Unlimited | Free | Everything | Privacy concerns, complex, cookieless mode available |
| **Mixpanel** | 20M events/mo | Free | Event-based analytics | Generous free tier, good for product analytics |
| **Amplitude** | 50K MTU | Free | Product analytics | Similar to Mixpanel |

**Recommendation for MVP**: PostHog (product analytics, it does everything) + Plausible or Vercel Analytics (web analytics).

---

## Domain & DNS

| Service | Cost | Best For | Notes |
|---------|------|----------|-------|
| **Cloudflare Registrar** | At-cost (~$10-15/yr for .com) | Cheapest domains | No markup, great DNS, free CDN/DDoS |
| **Namecheap** | $8-12/yr for .com | Domain management | Often has first-year deals |
| **Google Domains** (now Squarespace) | $12-14/yr for .com | Google ecosystem | Transferred to Squarespace |
| **Porkbun** | $8-10/yr for .com | Budget domains | Good prices, decent UI |

**Recommendation**: Cloudflare Registrar (cheapest, best DNS, free CDN).

---

## File Storage & CDN

| Service | Free Tier | Starter | Best For | Notes |
|---------|-----------|---------|----------|-------|
| **Uploadthing** | 2GB storage, 2GB bandwidth | $10/mo (100GB) | Next.js file uploads | Built for React/Next.js |
| **Cloudflare R2** | 10GB storage, no egress fees | $0.015/GB stored | S3-compatible, no egress | No egress fees! |
| **AWS S3** | 5GB (12-month free tier) | ~$0.023/GB stored + egress | Standard object storage | Egress fees add up |
| **Supabase Storage** | 1GB (included) | Included in plan | Supabase users | Integrated with Supabase Auth |
| **Vercel Blob** | 250MB | $0 (included in Pro) | Vercel users | Simple, integrated |

**Recommendation for MVP**: Uploadthing (simplest) or Cloudflare R2 (cheapest at scale, no egress fees).

---

## Total MVP Cost Estimates

### Scenario A: Maximum Free Tier ($0-15/mo)

| Service | Choice | Cost |
|---------|--------|------|
| Hosting | Vercel (Hobby) | $0 |
| Database | Neon (Free) | $0 |
| Auth | Clerk (Free, <10K MAU) | $0 |
| Email | Resend (Free, <3K/mo) | $0 |
| Payments | Stripe | 2.9%+30c per txn |
| Monitoring | Sentry (Free) | $0 |
| Analytics | PostHog (Free) | $0 |
| Domain | Cloudflare | ~$12/yr ($1/mo) |
| DNS/CDN | Cloudflare | $0 |
| **Total** | | **~$1/mo + Stripe fees** |

### Scenario B: Production-Ready ($50-100/mo)

| Service | Choice | Cost |
|---------|--------|------|
| Hosting | Vercel (Pro) | $20/mo |
| Database | Neon (Launch) | $19/mo |
| Auth | Clerk (Pro) | $25/mo |
| Email | Resend (Pro) | $20/mo |
| Payments | Stripe | 2.9%+30c per txn |
| Monitoring | Sentry (Team) | $26/mo |
| Analytics | PostHog (Free) | $0 |
| Domain | Cloudflare | ~$1/mo |
| DNS/CDN | Cloudflare | $0 |
| **Total** | | **~$111/mo + Stripe fees** |
