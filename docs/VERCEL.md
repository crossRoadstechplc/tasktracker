# Deploy SPX Task Tracker to Vercel

The app is a Next.js BFF: browser → Vercel `/api/*` → workforce-backend `/api/v1/task-tracker/*`.

## Prerequisites

1. Workforce backend is live with Task Operations (migrate + seed).
2. You know the public API base, e.g. `https://api.example.com/api/v1`.
3. Admin portal will set `NEXT_PUBLIC_TASK_TRACKER_URL` to this Vercel URL after deploy.

## Vercel project env

| Name | Required | Example |
|------|----------|---------|
| `BACKEND_API_BASE_URL` | Yes | `https://api.example.com/api/v1` |
| `ADMIN_PORTAL_URL` | Recommended | `https://admin.example.com` |

Do **not** set tracker `DATABASE_URL` for this deploy mode.

## CLI deploy

```bash
cd spx-task-tracker-app
npx vercel login
npx vercel link
npx vercel env add BACKEND_API_BASE_URL production
npx vercel env add ADMIN_PORTAL_URL production
npx vercel --prod
```

Or connect the GitHub repo `crossRoadstechplc/tasktracker` in the Vercel dashboard (branch `main_v2`), set the same env vars, and redeploy.

## After deploy

1. Copy the production URL (e.g. `https://tasktracker-xxx.vercel.app`).
2. On the **admin portal** Vercel project, set:
   `NEXT_PUBLIC_TASK_TRACKER_URL=https://tasktracker-xxx.vercel.app`
3. Redeploy the admin portal (Next bakes `NEXT_PUBLIC_*` at build time).
4. Ensure backend `CORS_ORIGINS` includes the tracker and portal origins (or `*` if you already use that).
5. In portal: Task Operations → Enable → Continue.

## Notes

- SSE (`/api/events`) is capped by Vercel function `maxDuration` (60s in `vercel.json`). Clients reconnect; CRUD still works.
- Local: `BACKEND_API_BASE_URL=http://localhost:4000/api/v1` and portal `NEXT_PUBLIC_TASK_TRACKER_URL=http://localhost:3001`.
