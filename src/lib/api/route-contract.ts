/**
 * Contract map: Next BFF path → Express path.
 * Used as a living checklist for cutover verification.
 */
export const TASK_TRACKER_ROUTE_CONTRACT = [
  ["GET /api/auth/me", "GET /api/v1/auth/me + GET /api/v1/task-tracker/me"],
  ["POST /api/auth/login", "POST /api/v1/auth/login"],
  ["POST /api/auth/logout", "POST /api/v1/auth/logout"],
  ["POST /api/auth/exchange", "POST /api/v1/task-tracker/session/consume"],
  ["GET /api/workspace", "GET /api/v1/task-tracker/workspace"],
  ["PUT /api/workspace", "PUT /api/v1/task-tracker/workspace"],
  ["POST /api/tasks", "POST /api/v1/task-tracker/tasks"],
  ["GET /api/events", "GET /api/v1/task-tracker/events"],
  ["POST /api/v1/admin/task-tracker/enable", "enable workspace + bootstrap staff"],
] as const;
