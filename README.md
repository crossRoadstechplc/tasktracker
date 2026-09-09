# SPX Task Tracker

Next.js **Task Operations** UI for Workforce. Browser calls this app’s `/api/*` BFF; the BFF proxies to **workforce-backend** `/api/v1/task-tracker/*` (workforce JWT cookies). Deploy the UI to **Vercel**; the API/DB stay on workforce-backend.

## Local setup

1. Copy `.env.example` to `.env` and set `BACKEND_API_BASE_URL` to your local workforce API (`http://localhost:4000/api/v1`).
2. Ensure workforce-backend is running (with Task Operations migrate/seed).
3. Start the tracker (use port 3001 if the admin portal already uses 3000):

```bash
npm install
npm run dev -- -p 3001
```

Open [http://localhost:3001](http://localhost:3001). Prefer portal **Continue** handoff over standalone login when integrating with Workforce.

## Vercel production

See [docs/VERCEL.md](docs/VERCEL.md). Minimum env: `BACKEND_API_BASE_URL`.

## Realtime (SSE)

Live updates use **Server-Sent Events** at `GET /api/events` (cookie session required), proxied to workforce-backend. On Vercel, connections are limited by function `maxDuration` and reconnect automatically.

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
