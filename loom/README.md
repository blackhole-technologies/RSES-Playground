# loom

The application. A self-hosted multi-user RSS-aggregating CMS built on top of the 13 vendored library units under `vendor/`.

## Run

```
cp .env.example .env
# edit DATABASE_URL and SESSION_SECRET

pnpm install
pnpm dev
```

Server listens on `PORT` (default 3000). `/health` returns 200 JSON, `/metrics` returns Prometheus text.

## Test

```
pnpm test                                     # unit tests (no DB)
TEST_DATABASE_URL=postgres://... pnpm test    # unit + integration (with DB)
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
