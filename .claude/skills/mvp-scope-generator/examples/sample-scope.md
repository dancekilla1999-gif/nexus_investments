# Zero-to-Production Scope of Work

## PingBase - API Endpoint Monitor for Indie Developers

**Generated**: 2026-04-10
**Input source**: MVP Opportunity Research Report (mvp-idea-generator output)
**Research scope**: 18 WebSearches, 8 WebFetch requests, 12 services priced, 3 competitors analyzed
**Overall confidence**: HIGH (4.2/5.0 weighted average)
**Estimated build time**: 5 weeks (solo developer)
**Estimated Month 1 cost**: $1/mo (within free tiers)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Database Architecture](#section-1-database-architecture)
3. [Feature Specification & API Design](#section-2-feature-specification--api-design)
4. [Tech Stack](#section-3-tech-stack)
5. [Landing Page & Design](#section-4-landing-page--design)
6. [SEO Strategy](#section-5-seo-strategy)
7. [Marketing & Go-to-Market](#section-6-marketing--go-to-market)
8. [Deployment & Infrastructure](#section-7-deployment--infrastructure)
9. [Testing Strategy](#section-8-testing-strategy)
10. [Timeline & Milestones](#section-9-timeline--milestones)
11. [Cost Estimates](#section-10-cost-estimates)
12. [Post-Launch & Growth](#section-11-post-launch--growth)

---

## Executive Summary

- **Product**: PingBase -- Simple, affordable API monitoring built for indie developers and small teams
- **Target user**: Solo developers, indie hackers, and small dev teams (1-5) running side projects or early-stage SaaS
- **Key differentiator**: Dead-simple setup (add a URL, done), transparent pricing at $9/mo, no enterprise bloat
- **Recommended tech stack**: Next.js 15 + Tailwind + shadcn/ui + Drizzle + Neon PostgreSQL + Clerk + Stripe + Vercel
- **Total build time**: 5 weeks solo
- **Month 1 operating cost**: ~$1/mo (domain only, everything else on free tiers)
- **Path to $10K MRR**: 1,112 Pro users at $9/mo. Realistic via SEO + community marketing + ProductHunt launch. Target: Month 8-12

---

## Section 1: Database Architecture [Confidence: HIGH]

### 1.1 Entity List

| Entity | Table Name | Description | Key Relationships |
|--------|-----------|-------------|-------------------|
| User | users | Registered users synced from Clerk | Has many monitors, alert_channels, subscriptions |
| Plan | plans | Subscription tiers (Free, Pro, Team) | Has many subscriptions |
| Subscription | subscriptions | User's active plan | Belongs to user, plan |
| Monitor | monitors | URL endpoints being tracked | Belongs to user, has many check_results, incidents |
| Check Result | check_results | Individual ping results | Belongs to monitor |
| Incident | incidents | Detected downtime events | Belongs to monitor, has many incident_events |
| Incident Event | incident_events | Timeline of incident progression | Belongs to incident |
| Alert Channel | alert_channels | Where to send alerts (email, Slack, webhook) | Belongs to user |
| Status Page | status_pages | Public status page config | Belongs to user, has many status_page_monitors |
| Status Page Monitor | status_page_monitors | Junction: which monitors show on which status page | Belongs to status_page, monitor |
| API Key | api_keys | API access keys for programmatic use | Belongs to user |

### 1.2 Complete Schema Definitions

#### Table: users

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| clerk_id | varchar(255) | NO | | UNIQUE | Clerk external ID |
| email | varchar(255) | NO | | UNIQUE | From Clerk |
| name | varchar(255) | YES | | | Display name |
| avatar_url | text | YES | | | Profile image URL |
| plan_id | uuid | YES | | FK -> plans.id | Current plan |
| timezone | varchar(50) | NO | 'UTC' | | For alert timing |
| created_at | timestamptz | NO | now() | | |
| updated_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_users_clerk_id` UNIQUE on (clerk_id) -- Clerk webhook lookups
- `idx_users_email` UNIQUE on (email) -- Email lookups

#### Table: plans

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| name | varchar(100) | NO | | | 'Free', 'Pro', 'Team' |
| slug | varchar(100) | NO | | UNIQUE | 'free', 'pro', 'team' |
| stripe_price_id_monthly | varchar(255) | YES | | | Stripe Price ID |
| stripe_price_id_yearly | varchar(255) | YES | | | Annual billing |
| price_monthly | integer | NO | 0 | | Cents: 0, 900, 2900 |
| price_yearly | integer | YES | | | Cents |
| max_monitors | integer | NO | 3 | | Plan limit |
| check_interval_seconds | integer | NO | 300 | | Min interval: 300, 60, 30 |
| max_alert_channels | integer | NO | 1 | | Alert channel limit |
| status_pages_enabled | boolean | NO | false | | Feature flag |
| api_access_enabled | boolean | NO | false | | Feature flag |
| retention_days | integer | NO | 7 | | Check result retention |
| sort_order | integer | NO | 0 | | Display ordering |
| created_at | timestamptz | NO | now() | | |

#### Table: subscriptions

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| user_id | uuid | NO | | FK -> users.id ON DELETE CASCADE, UNIQUE | One active sub per user |
| plan_id | uuid | NO | | FK -> plans.id | |
| stripe_subscription_id | varchar(255) | YES | | UNIQUE | NULL for free plan |
| stripe_customer_id | varchar(255) | YES | | | |
| status | varchar(50) | NO | 'active' | CHECK (status IN ('active','past_due','canceled','trialing')) | |
| billing_cycle | varchar(20) | NO | 'monthly' | | |
| current_period_start | timestamptz | YES | | | |
| current_period_end | timestamptz | YES | | | |
| cancel_at | timestamptz | YES | | | Scheduled cancellation |
| created_at | timestamptz | NO | now() | | |
| updated_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_subscriptions_user_id` UNIQUE on (user_id)
- `idx_subscriptions_stripe_id` UNIQUE on (stripe_subscription_id)

#### Table: monitors

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| user_id | uuid | NO | | FK -> users.id ON DELETE CASCADE | |
| name | varchar(255) | NO | | | User-friendly name |
| url | text | NO | | | Full URL to monitor |
| method | varchar(10) | NO | 'GET' | CHECK (method IN ('GET','POST','HEAD')) | HTTP method |
| headers | jsonb | NO | '{}' | | Custom headers |
| body | text | YES | | | Request body for POST |
| expected_status | integer | NO | 200 | | Expected HTTP status |
| timeout_ms | integer | NO | 30000 | CHECK (timeout_ms > 0 AND timeout_ms <= 60000) | Request timeout |
| interval_seconds | integer | NO | 300 | CHECK (interval_seconds >= 30) | Check frequency |
| is_active | boolean | NO | true | | Pause/resume |
| last_checked_at | timestamptz | YES | | | Last check timestamp |
| last_status | varchar(20) | YES | | | 'up', 'down', 'degraded' |
| last_response_time_ms | integer | YES | | | Last response time |
| consecutive_failures | integer | NO | 0 | | For alert threshold |
| alert_threshold | integer | NO | 2 | | Failures before alert |
| created_at | timestamptz | NO | now() | | |
| updated_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_monitors_user_id` on (user_id)
- `idx_monitors_active` on (is_active, last_checked_at) WHERE is_active = true
- `idx_monitors_next_check` on (is_active, interval_seconds, last_checked_at) -- For scheduler

#### Table: check_results

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| monitor_id | uuid | NO | | FK -> monitors.id ON DELETE CASCADE | |
| status | varchar(20) | NO | | | 'up', 'down', 'degraded' |
| response_time_ms | integer | YES | | | NULL if timeout |
| status_code | integer | YES | | | HTTP status code |
| error_message | text | YES | | | Error details if failed |
| headers_snapshot | jsonb | YES | | | Response headers |
| region | varchar(50) | NO | 'us-east-1' | | Check origin |
| checked_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_check_results_monitor_time` on (monitor_id, checked_at DESC) -- Time-series queries
- `idx_check_results_checked_at` on (checked_at) -- For cleanup/retention jobs

**Partitioning note**: Consider partitioning by checked_at (monthly) when >10M rows.

#### Table: incidents

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| monitor_id | uuid | NO | | FK -> monitors.id ON DELETE CASCADE | |
| status | varchar(20) | NO | 'ongoing' | CHECK (status IN ('ongoing','resolved')) | |
| started_at | timestamptz | NO | now() | | When downtime detected |
| resolved_at | timestamptz | YES | | | When service recovered |
| duration_seconds | integer | YES | | | Calculated on resolve |
| cause | text | YES | | | Root cause notes |
| created_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_incidents_monitor_id` on (monitor_id)
- `idx_incidents_status` on (status) WHERE status = 'ongoing'

#### Table: incident_events

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| incident_id | uuid | NO | | FK -> incidents.id ON DELETE CASCADE | |
| type | varchar(50) | NO | | | 'detected', 'alert_sent', 'acknowledged', 'resolved' |
| message | text | YES | | | Event description |
| metadata | jsonb | NO | '{}' | | Extra context |
| created_at | timestamptz | NO | now() | | |

#### Table: alert_channels

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| user_id | uuid | NO | | FK -> users.id ON DELETE CASCADE | |
| type | varchar(50) | NO | | CHECK (type IN ('email','slack','webhook','discord')) | |
| name | varchar(255) | NO | | | 'My Slack' |
| config | jsonb | NO | | | {"webhook_url": "...", "channel": "..."} |
| is_active | boolean | NO | true | | |
| created_at | timestamptz | NO | now() | | |

#### Table: status_pages

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| user_id | uuid | NO | | FK -> users.id ON DELETE CASCADE | |
| name | varchar(255) | NO | | | 'My App Status' |
| slug | varchar(255) | NO | | UNIQUE | URL slug: status.pingbase.dev/slug |
| custom_domain | varchar(255) | YES | | UNIQUE | Optional custom domain |
| logo_url | text | YES | | | Brand logo |
| is_public | boolean | NO | true | | |
| created_at | timestamptz | NO | now() | | |
| updated_at | timestamptz | NO | now() | | |

#### Table: status_page_monitors

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| status_page_id | uuid | NO | | FK -> status_pages.id ON DELETE CASCADE | |
| monitor_id | uuid | NO | | FK -> monitors.id ON DELETE CASCADE | |
| display_name | varchar(255) | YES | | | Override monitor name |
| sort_order | integer | NO | 0 | | |
| UNIQUE(status_page_id, monitor_id) | | | | | |

#### Table: api_keys

| Column | Type | Nullable | Default | Constraints | Notes |
|--------|------|----------|---------|-------------|-------|
| id | uuid | NO | gen_random_uuid() | PK | |
| user_id | uuid | NO | | FK -> users.id ON DELETE CASCADE | |
| name | varchar(255) | NO | | | 'Production Key' |
| key_prefix | varchar(10) | NO | | | 'pb_live_' |
| key_hash | varchar(255) | NO | | | SHA-256 hash |
| last_used_at | timestamptz | YES | | | |
| expires_at | timestamptz | YES | | | |
| revoked_at | timestamptz | YES | | | |
| created_at | timestamptz | NO | now() | | |

**Indexes**:
- `idx_api_keys_hash` on (key_hash) -- API key lookups
- `idx_api_keys_user_id` on (user_id)

### 1.3 Relationships & ERD

```
                    ┌──────────────┐
                    │    plans     │
                    └──────┬───────┘
                           │ 1
                           │
                           │ *
┌──────────────┐    ┌──────┴───────┐    ┌──────────────┐
│  api_keys    │*──1│    users     │1──*│alert_channels│
└──────────────┘    └──────┬───────┘    └──────────────┘
                           │ 1
                     ┌─────┼──────┐
                     │ 1   │ *    │ 1
              ┌──────┴──┐  │  ┌──┴───────────┐
              │subscrip-│  │  │ status_pages  │
              │  tions  │  │  └──────┬────────┘
              └─────────┘  │         │ 1
                           │         │ *
                    ┌──────┴───────┐  │  ┌───────────────────┐
                    │   monitors   │──┼──│status_page_monitors│
                    └──────┬───────┘  │  └───────────────────┘
                           │ 1
                     ┌─────┴──────┐
                     │ *          │ *
              ┌──────┴──────┐  ┌──┴──────────┐
              │check_results│  │  incidents   │
              └─────────────┘  └──────┬───────┘
                                      │ 1
                                      │ *
                               ┌──────┴────────┐
                               │incident_events │
                               └───────────────┘
```

### 1.4 Indexes & Performance Notes

| Index | Table | Column(s) | Type | Rationale |
|-------|-------|-----------|------|-----------|
| idx_monitors_next_check | monitors | (is_active, interval_seconds, last_checked_at) | BTREE | Scheduler queries for next checks |
| idx_check_results_monitor_time | check_results | (monitor_id, checked_at DESC) | BTREE | Time-series queries for dashboards |
| idx_check_results_cleanup | check_results | (checked_at) | BTREE | Retention cleanup job |
| idx_incidents_ongoing | incidents | (status) WHERE status='ongoing' | Partial BTREE | Active incident queries |
| idx_users_clerk_id | users | (clerk_id) | UNIQUE BTREE | Clerk webhook sync |

### 1.5 Seed Data

```sql
-- Subscription plans
INSERT INTO plans (id, name, slug, price_monthly, max_monitors, check_interval_seconds, max_alert_channels, status_pages_enabled, api_access_enabled, retention_days, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Free', 'free', 0, 3, 300, 1, false, false, 7, 0),
  ('00000000-0000-0000-0000-000000000002', 'Pro', 'pro', 900, 20, 60, 5, true, true, 90, 1),
  ('00000000-0000-0000-0000-000000000003', 'Team', 'team', 2900, 100, 30, 20, true, true, 365, 2);
```

### 1.6 Migration Strategy

- **Tool**: Drizzle Kit (`drizzle-kit`)
- **Approach**: Schema-first with auto-generated SQL migrations
- **Dev workflow**: `npx drizzle-kit push` (direct push to dev DB)
- **Production workflow**: `npx drizzle-kit generate` -> review SQL -> `npx drizzle-kit migrate` in CI/CD
- **Migration files**: Stored in `drizzle/migrations/` and committed to git

---

## Section 2: Feature Specification & API Design [Confidence: HIGH]

### 2.1 Feature: Monitor Management

#### User Stories

- As a developer, I want to add a URL to monitor so that I get alerted when it goes down
- As a developer, I want to customize check intervals so I can balance speed vs. plan limits
- As a developer, I want to pause/resume monitors so I can temporarily stop checks during maintenance
- As a developer, I want to see my monitor list with current status at a glance
- As a developer, I want to delete monitors I no longer need

#### Pages & UI Components

| Page | Route | Key Components | Auth Required |
|------|-------|---------------|---------------|
| Dashboard | /dashboard | Monitor list cards, uptime summary bar, quick-add form | Yes |
| Add Monitor | /dashboard/monitors/new | URL input, method select, interval select, headers editor, test button | Yes |
| Monitor Detail | /dashboard/monitors/[id] | Uptime chart (30d), response time chart, recent checks table, incidents list | Yes |
| Edit Monitor | /dashboard/monitors/[id]/edit | Same as Add but pre-filled | Yes |

#### Validation Rules

| Field | Type | Required | Min | Max | Pattern | Custom Rule |
|-------|------|----------|-----|-----|---------|-------------|
| url | string | yes | - | 2048 | ^https?:// | Must be valid URL |
| name | string | yes | 1 | 255 | - | - |
| method | enum | yes | - | - | GET,POST,HEAD | - |
| interval_seconds | number | yes | 30 | 300 | - | Must be >= plan minimum |
| timeout_ms | number | no | 1000 | 60000 | - | Default: 30000 |
| expected_status | number | no | 100 | 599 | - | Default: 200 |
| headers | object | no | - | - | - | Valid JSON, max 10 headers |
| alert_threshold | number | no | 1 | 10 | - | Default: 2 |

#### API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|-----------|-------------|
| GET | /api/v1/monitors | Required | 100/min | List user's monitors |
| POST | /api/v1/monitors | Required | 20/min | Create a new monitor |
| GET | /api/v1/monitors/:id | Required | 100/min | Get monitor details |
| PATCH | /api/v1/monitors/:id | Required | 20/min | Update monitor settings |
| DELETE | /api/v1/monitors/:id | Required | 20/min | Delete a monitor |
| POST | /api/v1/monitors/:id/test | Required | 10/min | Run a one-off check |
| POST | /api/v1/monitors/:id/pause | Required | 20/min | Pause monitoring |
| POST | /api/v1/monitors/:id/resume | Required | 20/min | Resume monitoring |

**Request Schema** (`POST /api/v1/monitors`):
```json
{
  "url": "string -- Full URL to monitor (required)",
  "name": "string -- Display name (required)",
  "method": "string -- HTTP method: GET, POST, HEAD (default: GET)",
  "interval_seconds": "number -- Check frequency in seconds (default: plan minimum)",
  "timeout_ms": "number -- Request timeout (default: 30000)",
  "expected_status": "number -- Expected HTTP status code (default: 200)",
  "headers": "object -- Custom request headers (default: {})",
  "body": "string -- Request body for POST (optional)",
  "alert_threshold": "number -- Consecutive failures before alert (default: 2)"
}
```

**Response Schema** (`201 Created`):
```json
{
  "monitor": {
    "id": "uuid",
    "url": "string",
    "name": "string",
    "method": "string",
    "interval_seconds": "number",
    "is_active": "boolean",
    "last_status": "string | null",
    "last_checked_at": "string | null",
    "created_at": "string"
  }
}
```

**Error Responses**:
| Status | Code | Message | When |
|--------|------|---------|------|
| 400 | invalid_url | URL must start with http:// or https:// | Invalid URL format |
| 400 | invalid_interval | Interval must be >= {plan_minimum} seconds | Below plan limit |
| 403 | monitor_limit_reached | Upgrade your plan to add more monitors | Exceeded plan's max_monitors |
| 401 | unauthorized | Unauthorized | No valid session |

### 2.2 Feature: Uptime Dashboard & Charts

#### User Stories

- As a developer, I want to see uptime percentage for each monitor over 24h/7d/30d
- As a developer, I want response time charts to identify performance degradation
- As a developer, I want to see a timeline of incidents for each monitor

#### Pages & UI Components

| Page | Route | Key Components | Auth Required |
|------|-------|---------------|---------------|
| Monitor Detail | /dashboard/monitors/[id] | Uptime bar (30d with day-by-day), response time line chart, checks table with pagination | Yes |
| Overview | /dashboard | Summary cards (total monitors, avg uptime, active incidents), mini sparklines | Yes |

#### API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|-----------|-------------|
| GET | /api/v1/monitors/:id/checks | Required | 100/min | List check results (paginated) |
| GET | /api/v1/monitors/:id/uptime | Required | 100/min | Get uptime stats (24h/7d/30d) |
| GET | /api/v1/monitors/:id/response-times | Required | 100/min | Get response time series |
| GET | /api/v1/overview | Required | 60/min | Dashboard overview stats |

**Query params** for `/checks`: `?page=1&limit=50&from=2026-04-01&to=2026-04-10`
**Query params** for `/uptime`: `?period=30d` (24h, 7d, 30d, 90d)
**Query params** for `/response-times`: `?period=24h&resolution=5m` (data points aggregated)

### 2.3 Feature: Alerting

#### User Stories

- As a developer, I want to receive email alerts when my endpoint goes down
- As a developer, I want to add Slack/Discord webhooks for team notifications
- As a developer, I want to configure how many consecutive failures trigger an alert
- As a developer, I want to receive a recovery notification when the endpoint comes back up

#### API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|-----------|-------------|
| GET | /api/v1/alert-channels | Required | 100/min | List alert channels |
| POST | /api/v1/alert-channels | Required | 10/min | Create alert channel |
| PATCH | /api/v1/alert-channels/:id | Required | 10/min | Update alert channel |
| DELETE | /api/v1/alert-channels/:id | Required | 10/min | Delete alert channel |
| POST | /api/v1/alert-channels/:id/test | Required | 5/min | Send test notification |

### 2.4 Feature: Status Pages (Pro+)

#### User Stories

- As a developer, I want to create a public status page showing my service uptime
- As a developer, I want to choose which monitors appear on my status page
- As a developer, I want to customize my status page with my brand logo

#### API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|-----------|-------------|
| GET | /api/v1/status-pages | Required | 100/min | List user's status pages |
| POST | /api/v1/status-pages | Required | 10/min | Create status page |
| PATCH | /api/v1/status-pages/:id | Required | 10/min | Update status page |
| DELETE | /api/v1/status-pages/:id | Required | 10/min | Delete status page |
| GET | /status/:slug | Public | 200/min | View public status page |

### 2.5 Authentication & Authorization

#### Auth Method
Clerk-managed authentication with email/password + Google OAuth + GitHub OAuth.

#### Auth Endpoints (Managed by Clerk)

| Flow | Handled By | Notes |
|------|-----------|-------|
| Signup | Clerk `<SignUp />` component | Redirects to /dashboard after signup |
| Login | Clerk `<SignIn />` component | Redirects to /dashboard |
| Logout | Clerk `<UserButton />` | Built-in |
| Password Reset | Clerk managed | Email flow |
| OAuth (Google, GitHub) | Clerk managed | Configured in Clerk dashboard |
| Webhook sync | POST /api/webhooks/clerk | Syncs user data to users table |

#### RBAC Matrix

| Permission | Free User | Pro User | Team User |
|------------|-----------|----------|-----------|
| Create monitors | 3 max | 20 max | 100 max |
| Check interval | 5 min min | 1 min min | 30s min |
| Alert channels | 1 max | 5 max | 20 max |
| Status pages | No | Yes | Yes |
| API access | No | Yes | Yes |
| Data retention | 7 days | 90 days | 365 days |

#### Security Measures
- Clerk handles brute force protection and bot detection
- API rate limiting via Upstash Ratelimit on all endpoints
- CSRF protection via Clerk's built-in mechanisms
- API key authentication uses SHA-256 hashed keys (plain key only shown once at creation)
- Webhook signature verification for Clerk and Stripe webhooks

### 2.6 Third-Party Integrations

| Service | Purpose | Specific APIs Used | Webhook Events |
|---------|---------|-------------------|----------------|
| Stripe | Payments & billing | Checkout Sessions, Billing Portal, Prices, Subscriptions | checkout.session.completed, customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed |
| Clerk | Authentication | User management, Organizations, Webhooks | user.created, user.updated, user.deleted |
| Resend | Transactional email | Send Email API | N/A (outbound only) |
| Upstash | Rate limiting + cron | Ratelimit SDK, QStash (cron triggers) | N/A |

### 2.7 Background Jobs

| Job | Type | Schedule/Trigger | Description | Priority |
|-----|------|-----------------|-------------|----------|
| run_checks | cron | Every 30 seconds | Query monitors due for checks, execute HTTP requests, store results | P0 - Critical |
| detect_incidents | event | After each check_result insert | If consecutive failures >= threshold, create/update incident, trigger alerts | P0 - Critical |
| send_alerts | event | On incident creation/resolution | Send notifications to user's alert channels | P0 - Critical |
| cleanup_checks | cron | Daily at 3 AM UTC | Delete check_results older than plan's retention_days | P1 - Important |
| sync_stripe | event | On Stripe webhook | Update subscription status from Stripe events | P1 - Important |
| generate_daily_report | cron | Daily at 9 AM (user timezone) | Send daily uptime summary email (Pro+ users) | P2 - Nice to have |

---

## Section 3: Tech Stack [Confidence: HIGH]

### 3.1 Stack Table

| Layer | Recommendation | Version | Alternative | Confidence | Why |
|-------|---------------|---------|-------------|------------|-----|
| Language | TypeScript | 5.x | - | 24/25 | Full-stack type safety |
| Framework | Next.js (App Router) | 15 | SvelteKit | 24/25 | Largest ecosystem, Vercel integration |
| UI | Tailwind CSS + shadcn/ui | 4.x + latest | Radix + CSS Modules | 23/25 | Fastest to build, beautiful defaults |
| Charts | Recharts | 2.x | Tremor, Chart.js | 19/25 | React-native, good for time-series |
| ORM | Drizzle ORM | latest | Prisma | 19/25 | Type-safe, lightweight, edge-compatible |
| Database | PostgreSQL via Neon | 16 | Supabase | 18/25 | Serverless, branching, 0.5GB free |
| Auth | Clerk | latest | Auth.js | 19/25 | Best DX, 10K MAU free, pre-built UI |
| Payments | Stripe | latest | Lemon Squeezy | 23/25 | Industry standard, best docs |
| Email | Resend | latest | Postmark | 16/25 | Modern DX, React Email, 3K/mo free |
| Hosting | Vercel | - | Railway | 22/25 | Zero-config Next.js, preview deploys |
| Cache/Queue | Upstash Redis + QStash | - | BullMQ | 18/25 | Serverless, rate limiting, cron |
| Monitoring | Sentry | latest | BetterStack | 22/25 | Error tracking, 5K errors/mo free |
| Analytics | PostHog | latest | Plausible | 20/25 | Product analytics, 1M events free |
| CI/CD | GitHub Actions | - | - | 23/25 | Free for public, 2K min/mo private |
| DNS | Cloudflare | - | - | 24/25 | Free DNS, DDoS protection |

### 3.2 Architecture Diagram

```
                         ┌─────────────┐
                         │   Browser   │
                         └──────┬──────┘
                                │
                         ┌──────┴──────┐
                         │ Cloudflare  │
                         │  DNS + CDN  │
                         └──────┬──────┘
                                │
                   ┌────────────┴────────────┐
                   │                         │
            ┌──────┴──────┐          ┌───────┴───────┐
            │   Vercel    │          │ status.domain │
            │  Next.js    │          │  (public page)│
            │  App + API  │          └───────────────┘
            └──────┬──────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
│   Neon    │ │Upstash│ │   Clerk   │
│ PostgreSQL│ │ Redis │ │   Auth    │
└───────────┘ │+QStash│ └───────────┘
              └───┬───┘
                  │
           ┌──────┴──────┐
           │  QStash     │
           │ Cron Jobs   │
           │ (30s checks)│
           └─────────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
┌─────┴─────┐ ┌──┴──┐ ┌─────┴─────┐
│  Stripe   │ │Resend│ │  Sentry   │
│ Payments  │ │Email │ │  Errors   │
└───────────┘ └─────┘ └───────────┘
```

### 3.3 Key Libraries & Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| next | Framework | MIT |
| react, react-dom | UI library | MIT |
| tailwindcss | Styling | MIT |
| @clerk/nextjs | Auth | MIT |
| drizzle-orm, drizzle-kit | Database ORM | Apache-2.0 |
| @neondatabase/serverless | Neon driver | MIT |
| stripe, @stripe/stripe-js | Payments | MIT |
| resend | Email | MIT |
| @upstash/ratelimit | Rate limiting | MIT |
| @upstash/qstash | Cron/queue | MIT |
| recharts | Charts | MIT |
| @sentry/nextjs | Error tracking | MIT |
| zod | Validation | MIT |
| date-fns | Date formatting | MIT |

---

## Section 4: Landing Page & Design [Confidence: HIGH]

### 4.1 Landing Page Sections

#### Hero Section
- **Headline Option 1**: "Know when your API goes down. Before your users do."
- **Headline Option 2**: "Simple uptime monitoring for developers who ship fast"
- **Headline Option 3**: "Your API is down. Shouldn't you know about it?"
- **Sub-headline**: "PingBase monitors your endpoints every 30 seconds and alerts you instantly via email, Slack, or Discord. Free for up to 3 monitors."
- **CTA Button**: "Start Monitoring Free" (links to /sign-up)
- **Visual**: Animated dashboard mockup showing uptime chart with a brief dip and recovery, green status indicators

#### Pain Point Section

| Pain Point | Icon Concept | Description |
|------------|-------------|-------------|
| "Found out from a user tweet" | megaphone | You shouldn't learn about downtime from angry users on social media |
| "Enterprise tools cost $200+/mo" | wallet | Datadog and PagerDuty are overkill for your side project or indie SaaS |
| "Setup takes hours" | clock | Most monitoring tools require agents, SDKs, or complex configuration |
| "Alert fatigue from noisy tools" | bell-off | Smart thresholds mean you only get alerted when something is actually wrong |

#### Features Section

| Feature | Title | Description |
|---------|-------|-------------|
| HTTP Monitoring | "Monitor Any Endpoint" | GET, POST, or HEAD requests with custom headers, expected status codes, and configurable timeouts |
| Instant Alerts | "Alerts Where You Work" | Email, Slack, Discord, or custom webhooks. You choose. |
| Response Time Charts | "Track Performance Over Time" | Beautiful charts showing response times and uptime percentage over 30 days |
| Status Pages | "Public Status Pages" | Give your users a status page at status.yourdomain.com. Builds trust. |
| API Access | "Automate Everything" | Full REST API for managing monitors programmatically. CI/CD-friendly. |

#### Social Proof Section (Pre-Launch Bootstrap)
- Show GitHub stars count (open-source the landing page or a related tool)
- "Trusted by 50+ indie developers" (once you have waitlist numbers)
- Display logos of well-known open source projects using it (after launch)
- Early testimonial quotes from beta testers

#### Pricing Section

| Plan | Price | Features | CTA |
|------|-------|----------|-----|
| Free | $0/forever | 3 monitors, 5-min checks, 1 alert channel, 7-day retention | "Get Started Free" |
| Pro | $9/mo | 20 monitors, 1-min checks, 5 alert channels, status pages, API access, 90-day retention | "Start Pro Trial" |
| Team | $29/mo | 100 monitors, 30s checks, 20 alert channels, status pages, API access, 1-year retention, priority support | "Start Team Trial" |

#### FAQ Section

| Question | Answer |
|----------|--------|
| How does PingBase check my endpoints? | We send HTTP requests from multiple regions at your configured interval. If the response doesn't match your expected status code or times out, we count it as a failure. |
| What happens when my endpoint goes down? | After consecutive failures hit your threshold (default: 2), we create an incident and immediately notify all your configured alert channels. |
| Can I monitor authenticated endpoints? | Yes! You can add custom headers (including Authorization tokens) to any monitor. |
| Do you offer a free plan? | Yes, forever free with 3 monitors and 5-minute check intervals. No credit card required. |
| How is PingBase different from UptimeRobot? | PingBase is built specifically for developers: cleaner UI, better API, transparent pricing, and 30-second check intervals (vs. 5 minutes on UptimeRobot free). |
| Can I use PingBase for my side project? | Absolutely! The free plan is perfect for side projects with up to 3 endpoints to monitor. |
| Do you support webhooks for alerts? | Yes, you can configure custom webhook URLs to receive JSON payloads for all incident events. |
| What's your uptime guarantee? | We aim for 99.9% uptime on our monitoring infrastructure. We use our own product to monitor ourselves. |

#### Final CTA Section
- **Headline**: "Stop finding out from your users. Start monitoring in 30 seconds."
- **Button**: "Create Free Account"

### 4.2 Pre-Launch Waitlist Page
- **Tool**: Build with Next.js (same stack, deploy to Vercel)
- **Headline**: "API monitoring that doesn't suck. Coming soon."
- **What to tease**: "30-second checks. $9/mo. Built for indie developers."
- **Email capture**: Simple email input + "Join the waitlist" button
- **Incentive**: "First 100 signups get 3 months of Pro free"
- **Social proof**: Show waitlist count: "Join 47 developers on the waitlist"

### 4.3 Design System Notes
- **Color palette**: Blue-600 (#2563EB) primary, Green-500 (#22C55E) for "up", Red-500 (#EF4444) for "down", Yellow-500 (#EAB308) for "degraded", Slate-50 background, Slate-900 text
- **Font**: Inter (headings and body) -- clean, modern, developer-friendly
- **Component library**: shadcn/ui (fully customizable, copy-paste components)
- **Icon set**: Lucide Icons (consistent with shadcn/ui)

---

## Section 5: SEO Strategy [Confidence: MEDIUM]

### 5.1 Target Keywords

#### Primary Keywords
| Keyword | Est. Search Volume | Difficulty | Target Page |
|---------|-------------------|-----------|-------------|
| api monitoring tool | 2,400/mo | Medium | Homepage |
| uptime monitoring | 5,400/mo | High | Homepage |
| website monitoring free | 3,600/mo | Medium | Pricing page |
| endpoint monitoring | 880/mo | Low | Features page |
| api uptime checker | 480/mo | Low | Homepage |

#### Long-Tail Keywords
| Keyword | Est. Search Volume | Content Type |
|---------|-------------------|-------------|
| how to monitor api endpoints | 320/mo | Tutorial blog |
| free api monitoring tools 2026 | 590/mo | Listicle blog |
| uptime monitoring for small teams | 170/mo | Landing page |
| how to set up status page | 260/mo | Tutorial blog |
| api monitoring best practices | 210/mo | Guide blog |

#### Comparison Keywords
| Keyword | Target |
|---------|--------|
| "uptimerobot alternative" | Comparison page |
| "pingdom alternative free" | Comparison page |
| "better uptime vs uptimerobot" | Comparison blog |
| "cheap uptime monitoring" | Pricing page |

### 5.2 Technical SEO Checklist

- [ ] `generateMetadata` on every page with unique title (<60 chars) and description (<160 chars)
- [ ] OpenGraph image auto-generated via `opengraph-image.tsx` (Next.js built-in)
- [ ] `app/sitemap.ts` generating dynamic sitemap including blog posts and status pages
- [ ] `app/robots.ts` allowing all public pages, blocking /dashboard/*, /api/*
- [ ] Schema.org `SoftwareApplication` on homepage
- [ ] Schema.org `FAQPage` on pricing page FAQ section
- [ ] `next/image` for all images with WebP/AVIF auto-optimization
- [ ] Canonical URLs via `metadataBase` in root layout
- [ ] Core Web Vitals targets: LCP < 2.5s (use ISR for landing page), FID < 100ms, CLS < 0.1

### 5.3 Content Plan

| # | Blog Post Title | Target Keyword | Type | Priority |
|---|----------------|---------------|------|----------|
| 1 | "5 Best Free API Monitoring Tools in 2026" | free api monitoring tools | Listicle | High |
| 2 | "How to Monitor Your API Endpoints: Complete Guide" | how to monitor api endpoints | Tutorial | High |
| 3 | "PingBase vs UptimeRobot: Which is Better for Developers?" | uptimerobot alternative | Comparison | High |
| 4 | "How to Set Up a Public Status Page in 5 Minutes" | set up status page | Tutorial | Medium |
| 5 | "API Monitoring Best Practices for Indie Developers" | api monitoring best practices | Guide | Medium |
| 6 | "Why Your Side Project Needs Uptime Monitoring" | uptime monitoring side project | Opinion | Medium |
| 7 | "How to Set Up Slack Alerts for API Downtime" | api downtime slack alerts | Tutorial | Medium |
| 8 | "The True Cost of API Downtime for Small SaaS" | api downtime cost | Guide | Low |
| 9 | "Building in Public: How I Built PingBase" | build in public saas | Story | Low |
| 10 | "Pingdom vs PingBase: A Developer's Honest Comparison" | pingdom alternative | Comparison | Low |

**Publishing cadence**: 1 post/week for first 3 months
**Internal linking**: Every blog post links to relevant feature pages and pricing

### 5.4 Backlink Strategy

1. **ProductHunt launch** -- High-quality backlink from producthunt.com
2. **GitHub open-source** -- Open-source a monitoring library or status page component, link back to PingBase
3. **Dev.to / Hashnode cross-posting** -- Republish blog content with canonical URLs
4. **HARO / Featured.com** -- Respond to journalist queries about uptime/monitoring topics
5. **Integration directories** -- Get listed on Slack App Directory, Discord bot listings

---

## Section 6: Marketing & Go-to-Market [Confidence: MEDIUM]

### 6.1 Pre-Launch Plan

| Week | Actions | Channels | Deliverables |
|------|---------|----------|-------------|
| -4 | Register pingbase.dev, set up waitlist landing page, create X account | Domain, Vercel, X | Live waitlist page |
| -3 | Start build-in-public thread on X, post "I'm building an uptime monitor" on r/SideProject and IndieHackers | X, Reddit, IH | First 50 waitlist signups |
| -2 | Record 60-second demo video, write launch blog post, set up ProductHunt Ship page | Loom, Blog, PH | Demo video, Ship page live |
| -1 | Schedule launch tweets, email waitlist with launch date, line up 15 supporters for PH | X, Email, DM | Launch day plan ready |

### 6.2 Launch Day Playbook

| Time (PT) | Action | Channel | Notes |
|-----------|--------|---------|-------|
| 12:01 AM | Publish ProductHunt listing | ProductHunt | First comment: tell the story |
| 12:05 AM | Tweet launch announcement with PH link | X | Pin the tweet |
| 8:00 AM | Post on r/SideProject, r/webdev, r/SaaS | Reddit | Different angle for each sub |
| 8:30 AM | Email waitlist: "We're live!" | Email (Resend) | Include PH link, special offer |
| 9:00 AM | Post on IndieHackers, Dev.to | IH, Dev.to | Milestone post format |
| 10:00 AM | LinkedIn post about the launch | LinkedIn | Professional angle |
| 12:00 PM | Respond to all PH comments, share social proof | PH, X | Retweet mentions |
| 3:00 PM | Share progress update (signups, PH rank) | X | Build-in-public style |
| 6:00 PM | Thank everyone, share final day stats | X, PH | Gratitude post |

### 6.3 Post-Launch Plan (Month 1-3)

#### Month 1: Foundation
- Publish 4 blog posts (weekly)
- Share daily build-in-public updates on X
- Engage in 3-5 Reddit/HN threads about monitoring weekly
- Reach out to 10 indie hackers personally for feedback
- **Target metrics**: 100 signups, 10 paid users, $90 MRR

#### Month 2: Content & Community
- Publish 4 blog posts (focus on comparison and SEO content)
- Launch Discord community for PingBase users
- Write a Show HN post about a technical aspect of PingBase
- Start "Weekly Uptime Report" newsletter
- **Target metrics**: 300 signups, 30 paid users, $270 MRR

#### Month 3: Growth
- Double down on top-performing content/channel
- Create integration with popular tools (Vercel, Railway status checks)
- Start lightweight paid acquisition ($100/mo Google Ads on competitor keywords)
- Reach out to SaaS review sites (G2, Capterra) for listing
- **Target metrics**: 600 signups, 70 paid users, $630 MRR

### 6.4 Marketing Tool Stack

| Purpose | Tool | Monthly Cost | Free Tier | Why |
|---------|------|-------------|-----------|-----|
| Email marketing | Loops | $0 (free to start) | 1,000 contacts | Built for SaaS, great onboarding flows |
| Social scheduling | Buffer | $0 | 3 channels, 10 scheduled posts | Simple, sufficient for solo |
| Analytics | PostHog | $0 | 1M events/mo | Product + marketing analytics in one |
| Feedback | Canny | $0 | Free tier | Public feature request board |
| Social listening | Manual (X search, Reddit) | $0 | - | Watch for monitoring-related questions |

### 6.5 Key Marketing Metrics

| Metric | Formula | Target (Month 1) | Target (Month 3) |
|--------|---------|------------------|------------------|
| Signups | Total new accounts | 100 | 600 |
| Free-to-Paid conversion | Paid users / Total users | 10% | 12% |
| MRR | Sum of subscription amounts | $90 | $630 |
| CAC | Marketing spend / New paid users | $0 (organic) | $10 |
| Website visitors | PostHog pageviews | 2,000 | 8,000 |

---

## Section 7: Deployment & Infrastructure [Confidence: HIGH]

### 7.1 Environment Setup

#### Local Development
```bash
# Prerequisites
node >= 20
pnpm >= 9
git

# Setup
git clone https://github.com/yourusername/pingbase.git
cd pingbase
pnpm install
cp .env.example .env.local
# Fill in env vars (see below)
pnpm db:push   # Push schema to dev DB
pnpm db:seed   # Seed plans
pnpm dev       # Start dev server at localhost:3000
```

#### Environment Variables
```
# Database
DATABASE_URL=postgresql://...@ep-xxx.us-east-2.aws.neon.tech/pingbase

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Stripe
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Resend
RESEND_API_KEY=re_...

# Upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

#### Staging
- **Platform**: Vercel (preview deployments on every PR)
- **Database**: Neon branch (auto-created per preview)
- **URL**: Auto-generated: pingbase-git-{branch}.vercel.app

#### Production
- **Platform**: Vercel (production deployment on main branch push)
- **Database**: Neon main branch
- **URL**: pingbase.dev

### 7.2 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint          # ESLint
      - run: pnpm type-check    # tsc --noEmit
      - run: pnpm test          # Vitest unit tests
      - run: pnpm build         # Verify build succeeds

  # Vercel handles deployment automatically via GitHub integration
```

- **Branching strategy**: Trunk-based (main branch = production)
- **Deploy trigger**: Push to main -> Vercel auto-deploys to production
- **PR previews**: Every PR gets a preview deployment on Vercel
- **Rollback**: Vercel instant rollback via dashboard (one click)

### 7.3 Infrastructure Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Hosting plan | Vercel Hobby ($0) -> Pro ($20/mo) | Upgrade when you need team features |
| Region | US East (iad1) | Closest to Neon default region |
| Env management | Vercel Environment Variables | Per-environment (dev/preview/prod) |
| Domain | pingbase.dev via Cloudflare | ~$12/yr |
| SSL | Auto (Vercel) | Included |
| CDN | Vercel Edge Network | Included |

### 7.4 Database Operations

- **Backups**: Neon automatic point-in-time recovery (included in all plans, 7-day for free, 30-day for paid)
- **Migrations**: `drizzle-kit generate` in CI, `drizzle-kit migrate` in production deploy script
- **Connection pooling**: Neon built-in connection pooling (use pooled connection string)
- **Branching**: Use Neon branches for preview deployments (schema matches PR code)
- **Read replicas**: Not needed until >$5K MRR / >10K concurrent users

### 7.5 Monitoring & Alerting

| Tool | Purpose | Free Tier | Priority |
|------|---------|-----------|----------|
| Sentry | Error tracking + performance | 5K errors/mo | P0 |
| Vercel Analytics | Web vitals | Included | P1 |
| Checkly or BetterStack | Uptime (monitor yourself!) | 5 monitors | P1 |
| PostHog | Product analytics | 1M events/mo | P1 |

**Alert rules**:
| Alert | Condition | Channel | Severity |
|-------|-----------|---------|----------|
| High error rate | >50 errors in 5 min | Email + Slack | Critical |
| Slow response | P95 > 3s for 10 min | Email | Warning |
| PingBase itself down | Uptime check fails | Email + SMS | Critical |
| Stripe webhook failures | >3 failures in 1 hour | Email | Critical |
| Database connection errors | Any connection failure | Email + Slack | Critical |

---

## Section 8: Testing Strategy [Confidence: HIGH]

### 8.1 Testing Pyramid

#### Unit Tests
- **Framework**: Vitest
- **Coverage target**: 70% on business logic (check scheduling, uptime calculation, plan limit enforcement)
- **Run command**: `pnpm test`

**Example test cases**:
```typescript
// Calculate uptime percentage
test('calculates uptime correctly with mixed results', () => {
  const checks = [
    { status: 'up' }, { status: 'up' }, { status: 'down' },
    { status: 'up' }, { status: 'up' },
  ]
  expect(calculateUptime(checks)).toBe(80.0)
})

// Plan limit enforcement
test('rejects monitor creation when plan limit reached', () => {
  const user = { plan: { max_monitors: 3 }, monitorCount: 3 }
  expect(() => validateMonitorCreation(user)).toThrow('monitor_limit_reached')
})

// Alert threshold logic
test('triggers alert after consecutive failures reach threshold', () => {
  const monitor = { consecutive_failures: 2, alert_threshold: 2 }
  expect(shouldTriggerAlert(monitor)).toBe(true)
})
```

#### Integration Tests
- **Framework**: Vitest + test database (Neon branch)
- **Database**: Neon branch per test run (or in-memory with pg-mem)

**Example test cases**:
| Test | Endpoint | Expected Result |
|------|----------|----------------|
| Create monitor | POST /api/v1/monitors | 201 with monitor object, verify DB row created |
| Exceed plan limit | POST /api/v1/monitors (4th on free) | 403 with monitor_limit_reached error |
| Stripe webhook | POST /api/webhooks/stripe (checkout.session.completed) | Subscription created in DB, user plan updated |
| Check result storage | Internal: storeCheckResult() | check_results row created, monitor.last_status updated |

#### E2E Tests
- **Framework**: Playwright
- **Critical flows**: 3 tests for MVP

| Flow | Steps | Expected Result |
|------|-------|----------------|
| Signup + First Monitor | Sign up -> Dashboard -> Add monitor -> See monitor in list | Monitor appears with "pending" status |
| Monitor Detail View | Navigate to monitor -> View uptime chart -> View checks table | Charts render, data displays correctly |
| Upgrade to Pro | Click upgrade -> Stripe Checkout -> Return to app | Pro features unlocked, monitor limits increased |

### 8.2 Pre-Launch Checklist

- [ ] Clerk signup/login/logout works (email + Google + GitHub)
- [ ] Stripe Checkout flow works end-to-end (subscribe -> webhook -> plan upgrade)
- [ ] Stripe Billing Portal works (cancel, update payment method)
- [ ] Creating a monitor works and checks start running
- [ ] Alert emails send correctly on incident detection
- [ ] Slack webhook alerts fire correctly
- [ ] Status page renders publicly with correct data
- [ ] Plan limits enforced (monitor count, interval minimums)
- [ ] API key creation and authentication works
- [ ] Responsive design works on mobile (dashboard, landing page)
- [ ] Rate limiting blocks excessive requests
- [ ] Webhook signature verification rejects invalid signatures (Clerk, Stripe)
- [ ] All environment variables set in Vercel production
- [ ] Database migrations applied to production Neon
- [ ] DNS propagated, SSL working on pingbase.dev
- [ ] Sentry receiving error events
- [ ] PostHog tracking pageviews and key events
- [ ] Privacy policy and terms of service pages live
- [ ] 404 page works and looks good

---

## Section 9: Timeline & Milestones [Confidence: HIGH]

### 9.1 Week-by-Week Build Plan

| Week | Focus Area | Deliverables | Parallel Track | Dependencies |
|------|-----------|-------------|----------------|-------------|
| 1 | Infrastructure + Auth | Repo setup, Next.js scaffold, Clerk integration, DB schema + migrations, basic dashboard layout | Landing page (Tailwind + shadcn) | None |
| 2 | Core Monitoring | Monitor CRUD API + UI, check execution engine (QStash cron), check result storage, dashboard with monitor list | Blog post #1 | Week 1 |
| 3 | Alerts + Charts | Alert channel CRUD, incident detection logic, email/Slack notifications, uptime charts (Recharts), response time charts | SEO setup (sitemap, robots, meta) | Week 2 |
| 4 | Payments + Status Pages | Stripe integration (Checkout, webhooks, Billing Portal), plan limit enforcement, status page CRUD + public view | Comparison pages, FAQ content | Week 2 |
| 5 | Polish + Launch Prep | API key auth, rate limiting, error handling, mobile responsive, E2E tests, production deploy, ProductHunt prep | ProductHunt Ship page, launch tweets | Week 3-4 |

### 9.2 Milestone Definitions

| # | Milestone | Definition of Done | Target |
|---|-----------|-------------------|--------|
| M1 | Infrastructure Ready | Repo, CI/CD, Clerk auth, DB schema deployed, basic dashboard renders | Week 1 |
| M2 | Monitoring Works | Can create monitor, checks run on schedule, results stored and displayed | Week 2 |
| M3 | Alerts Work | Incidents detected, email + Slack alerts sent on downtime and recovery | Week 3 |
| M4 | Payments Work | Stripe Checkout, webhooks, plan upgrades, limit enforcement all working | Week 4 |
| M5 | Landing Page Live | Landing page deployed with pricing, FAQ, waitlist/signup CTA | Week 1-2 |
| M6 | Beta Launch | All features working, deployed to production, 5-10 beta testers using it | Week 5 |
| M7 | Public Launch | ProductHunt launch, public marketing begins, accepting signups | Week 6 |

---

## Section 10: Cost Estimates [Confidence: HIGH]

### 10.1 Infrastructure Costs

| Service | Free Tier Limits | Month 1-3 | Month 4-6 | Scaling Trigger |
|---------|-----------------|-----------|-----------|----------------|
| Vercel | Hobby: 100GB BW | $0 | $20/mo (Pro) | Team features or >100GB BW |
| Neon | 0.5GB, 1 project | $0 | $0-19/mo | >0.5GB storage or need branching |
| Clerk | 10K MAU | $0 | $0 | >10K users |
| Upstash Redis | 10K cmds/day | $0 | $0-10/mo | >10K commands/day |
| Upstash QStash | 500 msgs/day | $0 | $0 | >500 cron invocations/day |
| Sentry | 5K errors/mo | $0 | $0 | >5K errors/mo |
| PostHog | 1M events/mo | $0 | $0 | >1M events |
| Cloudflare DNS | Unlimited | $0 | $0 | Never |
| **Total infra** | | **$0** | **$0-49/mo** | |

### 10.2 Tool & Service Costs

| Tool | Purpose | Monthly Cost | Notes |
|------|---------|-------------|-------|
| Domain (pingbase.dev) | Domain | ~$1/mo ($12/yr) | Cloudflare Registrar |
| Resend | Transactional email | $0 (free: 3K/mo) | Upgrade at $20/mo when >3K emails |
| Stripe | Payment processing | 2.9% + $0.30/txn | No monthly fee, per-transaction |
| Loops | Email marketing | $0 (free: 1K contacts) | Upgrade at $49/mo when >1K |
| **Total tools** | | **~$1/mo** | |

### 10.3 Total Monthly Burn Rate

| Category | Month 1-3 | Month 4-6 |
|----------|-----------|-----------|
| Infrastructure | $0 | $0-49 |
| Tools & services | ~$1 | ~$1-21 |
| Domain & DNS | $1 | $1 |
| **Total** | **~$1/mo** | **~$2-71/mo** |

### 10.4 Break-Even Analysis

- **Monthly costs at launch**: ~$1/mo
- **Average revenue per user (Pro)**: $9/mo
- **Break-even users**: 1 paid user (you're profitable from user #1)
- **At scale ($71/mo costs)**: 8 paid users to break even
- **Target break-even at scale**: Month 2

---

## Section 11: Post-Launch & Growth [Confidence: MEDIUM]

### 11.1 First-30-Days Monitoring Plan

| Frequency | What to Check | Tool | Action If Anomaly |
|-----------|--------------|------|-------------------|
| Daily | Error rate, signup count, check job success rate | Sentry, PostHog, Neon | Investigate errors > 10/day, fix immediately if P0 |
| Daily | Active monitors count, checks executed | Neon query | Ensure cron jobs running reliably |
| Weekly | Conversion funnel (visit -> signup -> paid) | PostHog | If <5% signup rate, improve landing page |
| Weekly | Churn: users who stopped logging in | Neon query | Send re-engagement email |
| Monthly | MRR, total users, feature usage | Stripe + Neon | Adjust roadmap priorities |

### 11.2 Key Metrics Dashboard

| Metric | Formula | Data Source | Target |
|--------|---------|------------|--------|
| MRR | Sum of active subscription amounts | Stripe | $630 by Month 3 |
| Total users | Count of users table | Neon | 600 by Month 3 |
| Paid users | Count where plan != 'free' | Neon | 70 by Month 3 |
| Free-to-paid conversion | Paid / Total | Calculated | 12% |
| Churn rate | Canceled this month / Active start of month | Stripe | <5% |
| Activation rate | Users with >= 1 monitor / Total signups | Neon | >60% |
| Monitors per user | Total monitors / Active users | Neon | >2.0 |
| Avg response time (PingBase) | P50 of API response times | Vercel Analytics | <200ms |

### 11.3 Scaling Triggers & Actions

| Trigger | Action | Est. Cost Impact |
|---------|--------|-----------------|
| >500 monitors total | Optimize check scheduling, batch DB writes | $0 (code optimization) |
| >10K checks/day | Upgrade Upstash plan, consider dedicated check workers | +$10-30/mo |
| >10K MAU | Upgrade Clerk to paid | +$25/mo |
| >0.5GB database | Upgrade Neon to Launch | +$19/mo |
| >$2K MRR | Invest in paid acquisition ($200/mo Google Ads) | +$200/mo |
| >$5K MRR | Hire part-time support, upgrade all services to paid tiers | +$500-1000/mo |
| >$10K MRR | Consider dedicated infrastructure, hire first employee | +$2000-5000/mo |

### 11.4 Feature Roadmap

| Version | Features | Priority | Estimated Effort |
|---------|----------|----------|-----------------|
| v1.1 | Multi-region checks, SSL certificate monitoring, maintenance windows | High | 2 weeks |
| v1.2 | Team/org support (multi-user), custom domains for status pages, keyword monitoring | High | 3 weeks |
| v2.0 | Synthetic monitoring (multi-step), API performance benchmarking, integrations (PagerDuty, OpsGenie) | Medium | 4-6 weeks |

### 11.5 Revenue Milestones

| Milestone | MRR Target | Users Needed | Timeline | Key Actions |
|-----------|-----------|-------------|----------|-------------|
| First $100 | $100 | ~11 Pro users | Month 1 | ProductHunt launch, waitlist conversion |
| First $1K | $1,000 | ~111 Pro users | Month 3-4 | SEO content, community marketing |
| First $5K | $5,000 | ~556 Pro users | Month 6-8 | Paid ads, partnerships, Team plan push |
| $10K MRR | $10,000 | ~1,112 Pro users | Month 8-12 | Scale acquisition, reduce churn, expand features |

---

*Generated by MVP Scope Generator. This scope is immediately actionable -- open your IDE and start with Section 1 (Database) and Section 7.1 (Environment Setup).*

**Next steps:**
- Copy the database schema (Section 1.2) and create your first Drizzle migration
- Deploy the landing page copy (Section 4) to start collecting waitlist signups today
- Use `/x-thread` to create a build-in-public launch thread from this scope
- Use `/x-post` to announce your build journey
- Revisit this scope weekly to track milestone progress
