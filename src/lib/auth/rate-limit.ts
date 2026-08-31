type AttemptWindow = {
  count: number;
  resetAt: number;
};

const ipAttempts = new Map<string, AttemptWindow>();
const emailAttempts = new Map<string, AttemptWindow>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isRateLimited(store: Map<string, AttemptWindow>, key: string): boolean {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  store.set(key, current);
  return current.count > MAX_ATTEMPTS;
}

export function checkLoginRateLimit(request: Request, email: string): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  const ip = getClientIp(request);
  return isRateLimited(ipAttempts, ip) || isRateLimited(emailAttempts, email.toLowerCase());
}
