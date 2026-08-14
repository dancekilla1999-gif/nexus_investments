# Security Architecture

Security is launch-blocking, not a backlog. This document is the checklist every milestone is
reviewed against (see PRD §34/`09-roadmap.md` "after every stage" gate).

## 1. Identity & session security

- **Passwords:** argon2id (memory-hard), per-user random salt, configurable cost params in
  `apps/api/src/config/security.config.ts`. Never bcrypt-only, never unsalted, never logged.
- **2FA:** TOTP (RFC 6238) mandatory for withdrawal/security-setting actions once enrolled;
  strongly prompted at registration. Backup codes, single-use, hashed at rest.
- **Sessions:** short-lived signed JWT access tokens (15 min) + rotating opaque refresh tokens
  stored server-side (Redis, hashed) so any session is remotely revocable — a stolen JWT
  self-expires in minutes even if the refresh token is never used again.
- **Device management:** every login fingerprints device (UA + IP + optional client-generated
  device ID), new devices trigger an email alert and appear in Security Center for the user to
  review/revoke.
- **Anti-phishing code:** user-set string echoed in every platform email, so a phishing email
  without it is immediately suspicious to the user.
- **Withdrawal address whitelist:** optional user setting; once enabled, withdrawals to
  non-whitelisted addresses require a time-locked cool-down + step-up 2FA.
- **Step-up authentication:** see `04-api-architecture.md §3`. Sensitive routes require a
  fresh 2FA assertion regardless of session validity.

## 2. Authorization

- RBAC (`roles`: `user`, `support`, `compliance`, `risk_ops`, `admin`, `superadmin`) +
  fine-grained `permissions` per role, enforced at the guard layer on every route — never
  inferred from the frontend.
- Admin Panel and user-facing API share one backend but are on **separate route namespaces**
  (`/api/v1/admin/*`) with their own guard stack and separate audit logging emphasis (every
  admin action writes an `audit_logs` row with the acting admin's ID, never just the affected
  user's).

### 2.1 Operator roles once investment management exists

Roles are extended with `investment_manager`, `trader`, `finance` and `analyst`; the full matrix
of what each may and may not do is `docs/12` §8. Two rules govern the whole set:

- **No role — including `superadmin` — has a path to user or pool funds.** Being an
  administrator confers *configuration* authority, never *economic* authority. The separation is
  enforced by the ledger trigger described in `docs/03` §2, so it holds even against someone who
  can change application code but not ship a migration unreviewed.
- **Risk limits and fee schedules are dual-control**: proposed by one role, approved by another,
  both recorded. A single compromised operator account cannot widen the limits it trades under.

A `trader` is scoped to explicitly assigned strategies. Assignment is itself an audited,
dual-controlled act — otherwise "who may trade this money" would be a self-service decision.

## 3. Secrets & key management

- No secret (DB credentials, JWT signing key, provider API keys, chain RPC keys) is ever
  committed — `.env` is git-ignored, `.env.example` documents required keys with placeholder
  values only.
- Production secrets come from a secrets manager (AWS Secrets Manager / GCP Secret Manager /
  Vault — infra-agnostic via a `SecretsProvider` interface in `apps/api/src/config/secrets/`),
  never from plain environment files on disk in production.
- **Private keys for custody wallets are never handled by the application process directly in
  a security-reviewed production deployment.** The `blockchain` module's signing path is an
  interface (`SigningProvider`) with a default *development-only* local-keystore
  implementation (clearly logged as unsafe-for-production at boot) and a documented production
  contract for HSM- or MPC-backed signing (Fireblocks/Copper/Qredo-style custody, or a
  threshold-MPC signer such as a `tss-lib`-based service) — see
  `06-blockchain-architecture.md §4`. Hot wallets hold only the operational float needed for
  same-day withdrawals; the majority of custodied assets sit in a cold/MPC-quorum wallet that
  the application cannot sign from unilaterally.

## 4. Data protection

- Encryption in transit: TLS everywhere (enforced at the load balancer/ingress and again by
  `helmet`/HSTS at the app layer).
- Encryption at rest: managed Postgres disk encryption + column-level encryption
  (`pgcrypto`/application-layer envelope encryption) for PII fields in `profiles` and KYC
  document references (documents themselves live in encrypted object storage, referenced by
  ID — never stored as DB blobs).
- PII minimization: KYC documents are proxied through a provider (see `05 §Compliance`) where
  possible so raw ID documents don't need to live in our storage at all.

## 5. Application security

- Input validation on every DTO (`class-validator` + a global `ValidationPipe` with
  `whitelist: true, forbidNonWhitelisted: true` — unknown fields are rejected, not ignored).
- `helmet` for standard HTTP hardening headers, strict CORS allowlist (no `*` in production).
- Rate limiting per-route and per-identity (`04-api-architecture.md §3`).
- SQL injection: closed by construction — Prisma parameterizes all queries; raw SQL is
  disallowed by lint rule except in reviewed, explicitly-commented migration/reporting code.
- Dependency hygiene: `npm audit`/Dependabot in CI (see `09-roadmap.md §MVP10`).

## 6. Anomaly detection & anti-fraud (risk engine)

- Every withdrawal passes a `risk` module scoring pass before it can be approved: velocity
  checks (amount/frequency vs. account history), new-device/new-address penalties, KYC-tier
  limits, sanctions/AML screening result, and a manual-review queue for anything above
  threshold — modeled by `risk_events` and surfaced in the Admin Panel's Risk Management Panel.
- P2P carries its own fraud signals (dispute rate, chargeback-style reversal patterns,
  velocity) feeding the same `risk_events` table so risk operations has one queue, not five.

## 7. Compliance controls

- **KYC:** tiered (basic email/phone → identity document + liveness → enhanced/proof-of-address
  for higher limits), implemented as a provider-abstraction (`KycProvider` interface) so a
  vendor (Sumsub, Onfido, Persona) can be swapped without touching the `kyc` module's
  business logic. See `09-roadmap.md §MVP3` for the concrete first-vendor recommendation, cost,
  and free-tier notes.
- **AML/sanctions:** transaction monitoring rules (structuring, rapid in/out, high-risk
  jurisdiction) plus a sanctions-list screening provider abstraction (`SanctionsProvider`,
  e.g. ComplyAdvantage/Chainalysis) checked at KYC and again at withdrawal time.
- **Travel Rule:** withdrawal flow captures counterparty VASP data where the destination is a
  known exchange (best-effort address-attribution provider) and is designed to plug into a
  Travel Rule messaging network (e.g. TRP/Notabene) before any jurisdiction that mandates it is
  enabled — flagged explicitly as a pre-launch gate per jurisdiction in `01-PRD.md §8`.
- **Audit trail:** see `03-database-architecture.md §5` — immutable, admin-attributable.

## 8. Testing this document

Every milestone's "definition of done" (see `09-roadmap.md`) includes a pass against this
document's relevant sections before merge — not just functional tests. MVP10 adds a dedicated
external security review (penetration test) as a hard gate before `PLATFORM_MODE=live` is ever
set outside a reviewed, insured, licensed deployment.
