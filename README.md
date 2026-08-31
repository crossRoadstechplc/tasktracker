# SPX Task Tracker

Next.js app with PostgreSQL (Neon), JWT cookie auth, email invites, and incremental REST APIs with SSE realtime.

## Local setup

1. Copy `.env.example` to `.env` and fill in values (or use your existing Neon `.env`).
2. Apply migrations and seed:

```bash
npm install
npm run db:deploy
npm run db:seed
npm run db:seed:auth
```

3. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Seed auth users use `@tracker.local` emails (see `src/lib/auth/seed-users.ts`) with password `ChangeMe123!`.

## Realtime (SSE)

Live updates use **Server-Sent Events** at `GET /api/events` (cookie session required). Mutations publish through Postgres `LISTEN/NOTIFY`.

Neon pooler URLs cannot `LISTEN`. The app derives a direct URL from `DATABASE_URL` by stripping `-pooler.` from the host. If that fails, set `DIRECT_URL` in `.env` to the same database using the non-pooler host.

## API overview

| Area | Routes |
|------|--------|
| Auth | `POST /api/auth/login`, `logout`, `GET me`, `accept-invite`, `change-password` |
| Workspace | `GET/PUT /api/workspace`, `POST /api/workspace/import` |
| Health / realtime | `GET /api/health`, `GET /api/events` |
| Tasks | `POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, `move`, `updates`, `archive` |
| Trash | `POST /api/trash/:trashId/restore` |
| Schedule | `POST/PATCH/DELETE /api/schedule/:id` |
| Projects / org teams | CRUD + members |
| Staff | `invite`, `PATCH/DELETE /api/staff/:id`, `role`, `resend-invite` |
| Permissions | `PUT /api/permissions` |

`GET /api/workspace` returns the legacy flat document. Workspace revision is in `ETag` / `X-Workspace-Revision` headers.

## Tests

```bash
npm run test          # unit tests
npm run test:e2e      # HTTP e2e (starts server if needed)
```

`test:e2e` starts (or reuses) the API server, runs Vitest, then tears down any server it spawned. It reuses `:3000` if `npm run dev` is already running; otherwise it starts one on `:3099`. No dev server required beforehand.

## Production notes

- Login is rate-limited (20 attempts per IP/email per 15 minutes).
- Auth cookies use `secure` only when `NODE_ENV=production`.
- For SSE behind nginx, disable buffering on `/api/events` (`proxy_buffering off`).
