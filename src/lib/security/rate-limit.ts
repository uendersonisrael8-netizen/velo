import { createHash } from "node:crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __veloRateLimit?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.__veloRateLimit ?? new Map<string, Bucket>();
globalForRateLimit.__veloRateLimit = buckets;

const MAX_BUCKETS = 20_000;

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Se ainda estiver grande, remove as entradas mais antigas pela ordem de
  // inserção. O Map preserva a ordem e evita crescimento sem limite.
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (typeof oldest !== "string") break;
    buckets.delete(oldest);
  }
}

/**
 * Rate limit em memória, por instância. É suficiente para bloquear rajadas
 * locais e funciona sem serviço externo. Em produção multi-instância, uma
 * camada distribuída (Upstash/Redis ou uma tabela no Supabase) deve substituir
 * este armazenamento; o Supabase Auth também aplica seus próprios limites.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  prune(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - 1),
      resetAt,
      retryAfter: Math.ceil(windowMs / 1000),
    };
  }

  current.count += 1;
  const allowed = current.count <= limit;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
    retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
  };
}

export function hashRateLimitKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    "unknown"
  );
}
