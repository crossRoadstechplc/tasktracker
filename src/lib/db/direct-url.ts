/** Neon pooler URLs cannot LISTEN/NOTIFY — use a direct host when possible. */
export function getDirectDatabaseUrl(): string {
  const direct = process.env.DIRECT_URL?.trim();
  if (direct) return direct;

  const pooled = process.env.DATABASE_URL?.trim();
  if (!pooled) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (pooled.includes("-pooler.")) {
    return pooled.replace("-pooler.", ".");
  }

  return pooled;
}
