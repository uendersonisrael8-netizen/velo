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
 * Origens que podem falar com as rotas da IA. Além do próprio site, entram o
 * WebView do app Android/iOS (https://localhost e capacitor://localhost) e o
 * Vite em desenvolvimento. Origens extras podem ser liberadas por env sem
 * precisar mexer no código.
 */
const APP_ORIGINS = [
  "https://localhost",
  "capacitor://localhost",
  "http://localhost",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function configuredOrigins() {
  return (process.env.VELO_IA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function resolveCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;

  const allowed = new Set<string>([
    request.nextUrl.origin,
    ...APP_ORIGINS,
    ...configuredOrigins(),
  ]);

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

  return allowed.has(origin) ? origin : null;
}

export function corsHeaders(request: NextRequest) {
  const origin = resolveCorsOrigin(request);
  if (!origin) return {} as Record<string, string>;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCors<T extends NextResponse>(response: T, request: NextRequest): T {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value);
  }
  return response;
}

export function corsPreflight(request: NextRequest) {
  if (!resolveCorsOrigin(request)) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  });
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
  return resolveCorsOrigin(request) !== null;
}

export async function readJsonBody(
  request: NextRequest,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? MAX_BODY_BYTES;
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Envie os dados como JSON.");
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new Error("Requisição muito grande.");
  }

  const text = await readLimitedText(request, maxBytes);
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
async function readLimitedText(request: NextRequest, maxBytes: number) {
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
      if (total > maxBytes) {
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
