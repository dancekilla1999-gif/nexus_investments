# Common SaaS Database Patterns

Ready-to-use schema patterns for common SaaS entities. Use these as starting points and customize for the specific product.

---

## 1. Users & Accounts

### When using managed auth (Clerk, Supabase Auth)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(255) NOT NULL UNIQUE,  -- Clerk user_id or Supabase auth.uid
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'user',  -- 'user', 'admin'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_external_id ON users(external_id);
CREATE INDEX idx_users_email ON users(email);
```

### When building custom auth

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  password_hash VARCHAR(255),  -- NULL if OAuth-only
  email_verified_at TIMESTAMPTZ,
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE oauth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,  -- 'google', 'github'
  provider_account_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 2. Multi-Tenancy (Organizations/Teams)

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,  -- URL-friendly name
  logo_url TEXT,
  plan_id UUID REFERENCES plans(id),
  stripe_customer_id VARCHAR(255) UNIQUE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',  -- 'owner', 'admin', 'member', 'viewer'
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org_id ON org_members(organization_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

CREATE TABLE org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  token VARCHAR(255) NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Subscription & Billing

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,           -- 'Free', 'Starter', 'Pro', 'Business'
  slug VARCHAR(100) NOT NULL UNIQUE,    -- 'free', 'starter', 'pro', 'business'
  stripe_price_id VARCHAR(255),         -- Stripe Price ID (NULL for free plan)
  price_monthly INTEGER NOT NULL DEFAULT 0,  -- Price in cents
  price_yearly INTEGER,                 -- Annual price in cents (NULL if no annual)
  features JSONB NOT NULL DEFAULT '{}', -- {"feature_a": true, "feature_b": false}
  limits JSONB NOT NULL DEFAULT '{}',   -- {"max_projects": 3, "max_members": 1, "api_calls": 1000}
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  plan_id UUID NOT NULL REFERENCES plans(id),
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_customer_id VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'active',  -- 'active', 'past_due', 'canceled', 'trialing', 'paused'
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'monthly',  -- 'monthly', 'yearly'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR organization_id IS NOT NULL)
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_org_id ON subscriptions(organization_id);
CREATE INDEX idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- For usage-based billing
CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  metric VARCHAR(100) NOT NULL,         -- 'api_calls', 'storage_bytes', 'emails_sent'
  quantity BIGINT NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stripe_usage_record_id VARCHAR(255),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_usage_records_sub_id ON usage_records(subscription_id);
CREATE INDEX idx_usage_records_metric ON usage_records(metric, recorded_at);
```

---

## 4. Audit Log

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_email VARCHAR(255),             -- Preserved even if user deleted
  entity_type VARCHAR(100) NOT NULL,    -- 'user', 'project', 'monitor', etc.
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,         -- 'created', 'updated', 'deleted', 'accessed'
  changes JSONB,                        -- {"field": {"old": "x", "new": "y"}}
  metadata JSONB DEFAULT '{}',          -- Additional context
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
-- Consider partitioning by created_at for large tables
```

---

## 5. Notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100) NOT NULL,           -- 'alert', 'info', 'billing', 'system'
  channel VARCHAR(50) NOT NULL DEFAULT 'in_app',  -- 'in_app', 'email', 'slack', 'webhook'
  title VARCHAR(255) NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',              -- Action URLs, entity references, etc.
  read_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- User notification preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(100) NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  slack_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE(user_id, notification_type)
);
```

---

## 6. API Keys

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,           -- User-friendly name: "Production Key"
  key_prefix VARCHAR(10) NOT NULL,      -- First 8 chars for identification: "sk_live_"
  key_hash VARCHAR(255) NOT NULL,       -- SHA-256 hash of the full key
  scopes JSONB DEFAULT '["read"]',      -- ["read", "write", "admin"]
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

---

## 7. Feature Flags

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,     -- 'new_dashboard', 'ai_features'
  name VARCHAR(255) NOT NULL,           -- 'New Dashboard'
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100),
  conditions JSONB DEFAULT '{}',        -- {"plans": ["pro", "business"], "users": ["uuid1"]}
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feature_flags_key ON feature_flags(key);
```

---

## 8. Waitlist (Pre-Launch)

```sql
CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  referral_code VARCHAR(50) UNIQUE,
  referred_by UUID REFERENCES waitlist(id),
  referral_count INTEGER NOT NULL DEFAULT 0,
  position INTEGER,
  source VARCHAR(100),                  -- 'landing_page', 'twitter', 'producthunt'
  metadata JSONB DEFAULT '{}',          -- UTM params, etc.
  invited_at TIMESTAMPTZ,              -- When they got access
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_waitlist_email ON waitlist(email);
CREATE INDEX idx_waitlist_referral_code ON waitlist(referral_code);
CREATE INDEX idx_waitlist_position ON waitlist(position);
```

---

## Common Column Patterns

### Timestamps (add to every table)
```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### Auto-update updated_at (PostgreSQL trigger)
```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to each table:
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### Soft Delete
```sql
deleted_at TIMESTAMPTZ  -- NULL means not deleted
-- Add to queries: WHERE deleted_at IS NULL
-- Create partial index: CREATE INDEX idx_{table}_active ON {table}(id) WHERE deleted_at IS NULL;
```

### UUID Primary Keys
```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
-- Requires: PostgreSQL 13+ (gen_random_uuid is built-in)
-- Or use: uuid-ossp extension with uuid_generate_v4()
```

### JSONB for Flexible Data
```sql
-- Store flexible/evolving data:
metadata JSONB DEFAULT '{}'
settings JSONB DEFAULT '{}'
features JSONB DEFAULT '{}'

-- Index for querying:
CREATE INDEX idx_{table}_metadata ON {table} USING GIN (metadata);

-- Query examples:
-- WHERE metadata->>'key' = 'value'
-- WHERE metadata @> '{"key": "value"}'
```

### Enum-like Columns
```sql
-- Option A: VARCHAR with CHECK constraint
status VARCHAR(50) NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'inactive', 'suspended', 'deleted'))

-- Option B: PostgreSQL ENUM type (harder to modify later)
CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'canceled', 'trialing');
status subscription_status NOT NULL DEFAULT 'active'

-- Recommendation: Use VARCHAR + CHECK for MVP (easier to modify), migrate to ENUM at scale
```
