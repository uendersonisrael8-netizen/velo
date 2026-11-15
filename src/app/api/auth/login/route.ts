import { NextResponse, type NextRequest } from "next/server";
import { authError, authJson, isTrustedOrigin, rateLimitHeaders, readJsonBody } from "@/lib/auth/api";
import { checkRateLimit, clientIp, hashRateLimitKey } from "@/lib/security/rate-limit";
import { authErrorMessage, authErrorStatus } from "@/lib/supabase/auth-errors";
import { createSupabaseRouteClient, isSupabaseRouteConfigured } from "@/lib/supabase/route";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_IP_LIMIT = 30;
const LOGIN_ACCOUNT_LIMIT = 8;

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }
  if (!isSupabaseRouteConfigured()) {
    return authError(
      "O velo ainda não está conectado ao Supabase neste ambiente. Configure as variáveis para entrar.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return authError(error instanceof Error ? error.message : "Requisição inválida.", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return authError(parsed.error.issues[0]?.message ?? "Confira os dados e tente de novo.", 400);
  }

  const { email, password } = parsed.data;
  const ip = clientIp(request);
  const ipLimit = checkRateLimit(`login-ip:${ip}`, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS);
  if (!ipLimit.allowed) {
    return authError(
      "Muitas tentativas deste dispositivo. Espere alguns minutos e tente de novo.",
      429,
      rateLimitHeaders(ipLimit),
    );
  }

  const accountLimit = checkRateLimit(
    `login-account:${ip}:${hashRateLimitKey(email)}`,
    LOGIN_ACCOUNT_LIMIT,
    LOGIN_WINDOW_MS,
  );
  if (!accountLimit.allowed) {
    return authError(
      "Muitas tentativas para esta conta. Espere alguns minutos e tente de novo.",
      429,
      rateLimitHeaders(accountLimit),
    );
  }

  const cookieJar = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, cookieJar);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  const headers = rateLimitHeaders(accountLimit);
  if (error) {
    const response = authError(
      authErrorMessage(error.message),
      authErrorStatus(error.message),
      headers,
    );
    cookieJar.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  if (!data.user) {
    return authError("Não foi possível iniciar sua sessão. Tente de novo.", 502, headers);
  }

  const response = authJson(
    {
      ok: true,
      user: {
        id: data.user.id,
        email: data.user.email ?? email,
      },
    },
    200,
    headers,
  );
  cookieJar.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
