# loom

The application. A self-hosted multi-user RSS-aggregating CMS built on top of the 13 vendored library units under `vendor/`.

## Run

Local Postgres comes from docker-compose. The first `pnpm db:up` initializes a named volume and seeds two databases — `loom` (dev) and `loom_test` (integration tests) — both reachable on `localhost:5432` as user `postgres`.

```
pnpm db:up           # starts postgres in background, blocks until healthy
cp .env.example .env # already targets the docker-compose Postgres
pnpm install
pnpm db:migrate      # applies pending migrations to the `loom` DB
pnpm dev
```

Server listens on `PORT` (default 3000). `/health` returns 200 JSON, `/metrics` returns Prometheus text.

Stop the DB with `pnpm db:down`. Data persists in the `loom-postgres-data` volume; remove it with `docker volume rm loom-postgres-data` for a clean slate.

Requires Docker Compose v2.17 or newer (the `--wait` flag landed in 2.17).

## Test

```
pnpm test                  # unit tests only — integration tests skip without DB
pnpm test:integration      # full suite — requires `pnpm db:up` to be running
```

## Typecheck

```
pnpm typecheck
```

## Layout

- `server.ts` — entry point.
- `core/` — bootstrap, config, db, events, hooks.
- `engines/` — framework-level wrappers around `vendor/` units (logger, metrics, security; more added per phase).
- `modules/` — feature modules (auth, content, feeds, etc. — added per phase).
- `vendor/` — 13 self-contained library units. Treat as forked dependencies; edit as needed.
- `tests/{unit,integration,e2e}/` — tests by scope.
- `ui/` — frontend code (added in Phase 6+).
- `shared/` — cross-module types and schemas.

## Phase status

Phase 0 complete. See `../cms-spec/IMPLEMENTATION.md` for the full build order.

## License

MIT
