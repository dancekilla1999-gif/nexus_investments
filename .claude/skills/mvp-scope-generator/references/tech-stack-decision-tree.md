# Tech Stack Decision Tree

Use this framework to select the optimal tech stack based on product type, team size, and constraints.

---

## Step 1: Product Type Classification

### A. Standard Web SaaS (CRUD-heavy, dashboard-style)
- Examples: project management, CRM, analytics dashboard, monitoring
- Key needs: Forms, tables, charts, user management, billing
- **Go to**: Template A or Template D

### B. API-First Product (developer tool, integration, CLI)
- Examples: API gateway, webhook service, data pipeline, dev tool
- Key needs: High-performance API, documentation, API keys, usage metering
- **Go to**: Template B

### C. Real-Time Product (chat, collaboration, live updates)
- Examples: team chat, collaborative editor, live dashboard, notification hub
- Key needs: WebSocket/SSE, presence, conflict resolution, low latency
- **Go to**: Template D

### D. Data-Heavy Product (analytics, reporting, ML/AI)
- Examples: BI tool, ML pipeline, data visualization, AI assistant
- Key needs: Heavy computation, data processing, large datasets, background jobs
- **Go to**: Template C

### E. Marketplace / Two-Sided Platform
- Examples: freelance marketplace, SaaS marketplace, rental platform
- Key needs: Two user types, escrow/split payments, search, reviews
- **Go to**: Template A with Stripe Connect

### F. Mobile-First Product
- Examples: consumer app, mobile SaaS, on-the-go tool
- Key needs: Native mobile experience, push notifications, offline support
- **Go to**: Template A (web MVP) or React Native/Expo + Template B (API)

---

## Step 2: Team Size Modifier

### Solo Developer
- **Priority**: Speed, managed services, minimal DevOps
- **Bias toward**: Full-stack frameworks (Next.js, SvelteKit), managed DB (Neon, Supabase), managed auth (Clerk)
- **Avoid**: Microservices, self-hosted infrastructure, complex CI/CD
- **Deploy**: Vercel, Railway, or Render (one-click deploys)

### 2-3 Person Team
- **Priority**: Clear separation, good DX, shared conventions
- **Bias toward**: Monorepo with turborepo, or clean frontend/backend split
- **Can consider**: Separate API backend, self-managed DB with backups
- **Deploy**: Vercel + Railway, or AWS Amplify

### Small Team (4-8)
- **Priority**: Scalability, code organization, testing
- **Can consider**: Microservices (if justified), custom infrastructure, multiple databases
- **Deploy**: AWS/GCP with IaC (Terraform, Pulumi)

---

## Step 3: Time Constraint Modifier

### Ultra-Fast (<2 weeks)
- Use a SaaS boilerplate/starter kit:
  - **ShipFast** (Next.js) -- $199, includes auth, payments, email, landing page
  - **Shipped** (Next.js) -- $149, similar feature set
  - **Makerkit** (Next.js/Remix) -- $299, multi-tenant SaaS kit
  - **Supastarter** (Next.js + Supabase) -- $249
- Trade-off: Less customization, potential vendor lock-in
- Best for: Validating market demand quickly

### Standard (2-6 weeks)
- Full-stack framework with managed services
- Use the Stack Templates below
- Best for: Most MVPs

### Extended (6-12 weeks)
- More custom architecture acceptable
- Can build custom auth, custom billing portal, advanced features
- Consider: Is the extra time justified by requirements?

---

## Stack Templates

### Template A: "The Solo SaaS Stack" (Most Common)

Best for: Standard web SaaS, solo/small team, 2-6 week build

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript | Type safety, full-stack, largest ecosystem |
| Framework | Next.js (App Router) | SSR/SSG, API routes, Vercel integration |
| UI | Tailwind CSS + shadcn/ui | Rapid styling, beautiful components, fully customizable |
| ORM | Drizzle ORM | Type-safe, lightweight, great migrations, edge-compatible |
| Database | PostgreSQL via Neon | Serverless, branching, generous free tier (0.5 GB) |
| Auth | Clerk | Best DX, 10K MAU free, pre-built components, webhooks |
| Payments | Stripe | Industry standard, best docs, Checkout + Billing Portal |
| Email | Resend | Modern API, React Email templates, 3K/mo free |
| Hosting | Vercel | Zero-config Next.js deploys, preview deployments |
| Cache/Queue | Upstash Redis | Serverless Redis, rate limiting, queues, 10K commands/day free |
| Monitoring | Sentry | Error tracking, 5K errors/mo free, Next.js SDK |
| Analytics | PostHog | Product analytics, 1M events/mo free, session replay |
| CI/CD | GitHub Actions | Free for public repos, 2K min/mo for private |
| DNS | Cloudflare | Free DNS, DDoS protection, edge caching |

### Template B: "The API-First Stack"

Best for: Developer tools, API products, CLI tools

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript or Go | TS for ecosystem, Go for performance |
| API Framework | Hono | Ultra-fast, edge-compatible, middleware ecosystem |
| Dashboard | Next.js (minimal) | Admin dashboard, API key management |
| ORM | Drizzle ORM | Same benefits, works with Hono |
| Database | PostgreSQL via Neon | Serverless, great for API-first |
| Auth | Custom JWT + API Keys | API key auth for developers, JWT for dashboard |
| Payments | Stripe (usage-based) | Metered billing, usage records API |
| Email | Resend | Transactional emails, API notifications |
| Hosting | Railway or Fly.io | Always-on server (not serverless), global edge |
| Docs | Mintlify or Fumadocs | Beautiful API docs, OpenAPI integration |
| Monitoring | Sentry + BetterStack | Error tracking + uptime monitoring |
| Analytics | PostHog | API usage analytics, funnel analysis |

### Template C: "The Python Stack"

Best for: Data-heavy products, ML/AI features, analytics tools

| Layer | Choice | Why |
|-------|--------|-----|
| Language | Python (backend) + TypeScript (frontend) | Python ML ecosystem, TS for frontend |
| Backend | FastAPI | Async, auto-generated OpenAPI docs, type hints |
| Frontend | Next.js or React + Vite | Modern frontend, SSR if needed |
| ORM | SQLAlchemy + Alembic | Mature, powerful, great migration support |
| Database | PostgreSQL via Supabase or RDS | Full-featured, great for analytics queries |
| Auth | Auth.js or Supabase Auth | Self-hosted for Python backend |
| Payments | Stripe | Standard |
| Email | Resend or SendGrid | Transactional + marketing |
| Hosting | Railway (API) + Vercel (frontend) | Railway supports Python, Vercel for Next.js |
| Job Queue | Celery + Redis or Dramatiq | Python background job processing |
| ML/AI | OpenAI API / Hugging Face | Depending on AI needs |

### Template D: "The Real-Time Stack"

Best for: Live collaboration, chat, real-time dashboards

| Layer | Choice | Why |
|-------|--------|-----|
| Language | TypeScript | Full-stack consistency |
| Framework | Next.js + Supabase | Supabase Realtime for WebSocket subscriptions |
| UI | Tailwind CSS + shadcn/ui | Same rapid development |
| Database | Supabase PostgreSQL | Built-in Realtime, Row Level Security |
| Auth | Supabase Auth | Integrated with database RLS, 50K MAU free |
| Real-time | Supabase Realtime | Postgres changes broadcast, presence |
| Payments | Stripe | Standard |
| Email | Resend | Standard |
| Hosting | Vercel (frontend) + Supabase (backend) | Managed infrastructure |
| Alternative RT | Pusher or Ably | If not using Supabase, dedicated real-time service |

---

## Database Selection Matrix

| Factor | PostgreSQL | MySQL | SQLite/LibSQL | MongoDB |
|--------|-----------|-------|---------------|---------|
| **Best for** | Most SaaS apps | WordPress/legacy | Edge computing, embedded | Document-heavy, flexible schema |
| **Managed options** | Neon, Supabase, RDS, Railway | PlanetScale (sunset), RDS | Turso (LibSQL) | MongoDB Atlas |
| **JSON support** | Excellent (JSONB, indexable) | Limited (JSON type) | JSON functions | Native (BSON) |
| **Full-text search** | Built-in (tsvector) | Built-in (FULLTEXT) | FTS5 extension | Built-in (Atlas Search) |
| **Transactions** | Full ACID | Full ACID | Full ACID | Multi-doc since 4.0 |
| **Serverless options** | Neon (branching!), Supabase | PlanetScale (legacy) | Turso (edge replication) | Atlas Serverless |
| **Cost (free tier)** | Neon: 0.5 GB, Supabase: 500 MB | Limited | Turso: 9 GB | Atlas: 512 MB |
| **Recommendation** | **Default choice for SaaS** | Only if existing ecosystem requires it | Edge/embedded only | Avoid for transactional SaaS |

**Decision**: Unless you have a specific reason not to, use **PostgreSQL**. It handles JSON, full-text search, and relational data equally well.

---

## Common Add-Ons (All Templates)

| Need | Tool | When to Add |
|------|------|-------------|
| Rate limiting | Upstash Ratelimit | At launch (protect auth + API endpoints) |
| Feature flags | Vercel Flags or PostHog | When you need gradual rollouts |
| File uploads | Uploadthing or S3 + presigned URLs | When users need to upload files |
| Search | Meilisearch or Algolia | When built-in DB search isn't enough |
| Cron jobs | Vercel Cron or Upstash QStash | For scheduled tasks (daily emails, cleanup) |
| PDF generation | @react-pdf/renderer or Puppeteer | For invoices, reports, exports |
| Image optimization | Cloudflare Images or next/image | For user-uploaded images |
