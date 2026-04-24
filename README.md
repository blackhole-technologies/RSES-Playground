# rsscms

A self-hosted multi-user RSS-aggregating CMS.

## Structure

- `loom/` — the application. Start here. Includes `loom/vendor/` with the 13 library units it depends on.
- `cms-spec/` — design documents for what loom is building.
- `archive/parent-2026-04/` — a previous scaffold kept for historical reference. Not maintained.

## Run

```
cd loom
pnpm install
# Create a Postgres database and set DATABASE_URL
# Generate SESSION_SECRET with: openssl rand -base64 48
pnpm dev
```

Open http://localhost:3000/health to verify the server is running.

## Status

loom is at Phase 0 per `cms-spec/IMPLEMENTATION.md` — the scaffold runs and responds to `/health` and `/metrics`. Phase 1 (migrations + auth + sessions) is the next step. See `cms-spec/IMPLEMENTATION.md` for the full build order.

## License

MIT
