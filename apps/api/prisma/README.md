# Prisma schema & migrations

`schema.prisma` is the canonical data model — see `docs/03-database-architecture.md` for the
design rationale. `seed.ts` seeds reference data only (chains, assets, subscription plans);
never fake user/financial data outside `development`.

## Conventions

- Every migration is generated with `prisma migrate dev` and the resulting
  `migrations/*/migration.sql` is **reviewed and committed** — never `prisma db push` in
  staging/production.
- **Financial-table migrations** (anything touching `ledger_*`, `balances`, `deposits`,
  `withdrawals`, `orders`, `trades`, `p2p_*`) require a second reviewer and a rollback note in
  the pull request, by team convention.
- `AuditLog`, `LedgerEntry`, and `SignalResult` are append-only by application convention (no
  update/delete service method exists for them anywhere in `apps/api/src`) — a migration that
  adds such a method to those models should be rejected in review.

## Local setup

```bash
docker compose -f infra/compose/docker-compose.yml up -d   # Postgres + Redis
cp .env.example .env                                        # from repo root
npm run prisma:migrate -w apps/api                          # applies + generates
npm run prisma:seed -w apps/api                              # reference data
npm run dev:api                                              # from repo root
```

## Verified locally

This schema and the MVP1 migration (`migrations/20260813205445_init`) were applied against a
real PostgreSQL 16 instance and exercised end-to-end (register → profile fetch → refresh
rotation → replay-attack detection → 2FA enrollment → 2FA-gated login) as part of this
delivery — see `CHANGELOG.md`. It is not just a schema that type-checks; it has been run.
