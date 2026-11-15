import { NextResponse, type NextRequest } from "next/server";
import type { RateLimitResult } from "@/lib/security/rate-limit";

const MAX_BODY_BYTES = 8 * 1024;

export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function authJson(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return NextResponse.json(data, {
    status,
    headers: { ...NO_STORE_HEADERS, ...extraHeaders },
  });
}

export function authError(
  message: string,
  status = 400,
  extraHeaders: Record<string, string> = {},
) {
  return authJson({ ok: false, error: message }, status, extraHeaders);
}

export function rateLimitHeaders(result: RateLimitResult) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfter) }),
  };
}

/**
 * Browsers enviam `Origin` em POSTs. Exigir que ele pertença ao próprio site
 * (ou ao domínio público configurado) bloqueia CSRF em navegadores antigos que
 * ainda não aplicam SameSite. Requisições sem Origin são permitidas porque
 * clientes nativos e algumas integrações não enviam o header.
 */
export function isTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const allowed = new Set<string>([request.nextUrl.origin]);
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      // URL pública inválida: o próprio host da requisição continua valendo.
    }
  }
  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://127.0.0.1:3000");
  }
  return allowed.has(origin);
}

export async function readJsonBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Envie os dados como JSON.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    throw new Error("Requisição muito grande.");
  }

  const text = await readLimitedText(request);
  if (!text) throw new Error("Requisição vazia.");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("JSON inválido.");
  }
}

/**
 * Lê o corpo em stream e aborta assim que passa do limite. Confiar apenas no
 * `Content-Length` permitiria um cliente omitir o header e enviar um corpo
 * enorme; aqui o limite vale para o número real de bytes recebidos.
 */
async function readLimitedText(request: NextRequest) {
  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Requisição muito grande.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}
