import { NextResponse, type NextRequest } from "next/server";
import { authError, authJson, isTrustedOrigin, rateLimitHeaders, readJsonBody } from "@/lib/auth/api";
import { checkRateLimit, clientIp, hashRateLimitKey } from "@/lib/security/rate-limit";
import { authErrorMessage, authErrorStatus } from "@/lib/supabase/auth-errors";
import { createSupabaseRouteClient, isSupabaseRouteConfigured } from "@/lib/supabase/route";
import { signUpSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNUP_WINDOW_MS = 60 * 60 * 1000;
const SIGNUP_IP_LIMIT = 5;
const SIGNUP_EMAIL_LIMIT = 3;

export async function POST(request: NextRequest) {
  if (!isTrustedOrigin(request)) {
    return authError("Origem da requisição não autorizada.", 403);
  }
  if (!isSupabaseRouteConfigured()) {
    return authError(
      "O velo ainda não está conectado ao Supabase neste ambiente. Configure as variáveis para criar uma conta.",
      503,
    );
  }

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    return authError(error instanceof Error ? error.message : "Requisição inválida.", 400);
  }

  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success) {
    return authError(parsed.error.issues[0]?.message ?? "Confira os dados e tente de novo.", 400);
  }

  const { displayName, handle, email, password } = parsed.data;
  const ip = clientIp(request);
  const ipLimit = checkRateLimit(`signup-ip:${ip}`, SIGNUP_IP_LIMIT, SIGNUP_WINDOW_MS);
  if (!ipLimit.allowed) {
    return authError(
      "Muitas contas criadas deste dispositivo. Espere um pouco e tente de novo.",
      429,
      rateLimitHeaders(ipLimit),
    );
  }

  const emailLimit = checkRateLimit(
    `signup-email:${hashRateLimitKey(email)}`,
    SIGNUP_EMAIL_LIMIT,
    SIGNUP_WINDOW_MS,
  );
  if (!emailLimit.allowed) {
    return authError(
      "Muitas tentativas para este e-mail. Espere um pouco e tente de novo.",
      429,
      rateLimitHeaders(emailLimit),
    );
  }

  const cookieJar = NextResponse.next();
  const supabase = createSupabaseRouteClient(request, cookieJar);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        handle,
        display_name: displayName,
      },
      emailRedirectTo: new URL("/auth/callback", request.nextUrl.origin).toString(),
    },
  });

  const headers = rateLimitHeaders(emailLimit);
  if (error) {
    if (error.message.toLowerCase().includes("database error")) {
      const response = authError(
        "Não foi possível criar seu perfil. Verifique se o handle já existe e se o schema.sql está atualizado.",
        409,
        headers,
      );
      cookieJar.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
      return response;
    }

    const response = authError(
      authErrorMessage(error.message),
      authErrorStatus(error.message),
      headers,
    );
    cookieJar.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    return response;
  }

  const response = authJson(
    {
      ok: true,
      needsConfirmation: !data.session,
      user: data.user
        ? {
            id: data.user.id,
            email: data.user.email ?? email,
          }
        : null,
    },
    200,
    headers,
  );
  cookieJar.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
