import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const CONFIGURED_URL = process.env.VELO_IA_API_URL?.trim().replace(/\/+$/, "");
const CONFIGURED_KEY = process.env.VELO_IA_API_KEY?.trim();
const CONFIGURED_TIMEOUT = Number(process.env.VELO_IA_TIMEOUT_MS ?? "45000");

const ANON_COOKIE = "velo_ia_session";
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const ANON_TOKEN_RE = /^[A-Za-z0-9_-]{32,64}$/;
const TIMEOUT_MS = Number.isFinite(CONFIGURED_TIMEOUT)
  ? Math.min(120_000, Math.max(5_000, CONFIGURED_TIMEOUT))
  : 45_000;

export class VeloIaRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "VeloIaRequestError";
    this.status = status;
  }
}

export type VeloIaIdentity = {
  conversationId: string;
  authenticated: boolean;
  cookie?: {
    name: string;
    value: string;
    options: {
      httpOnly: true;
      sameSite: "lax";
      secure: boolean;
      path: string;
      maxAge: number;
    };
  };
};

export type VeloIaChatResult = {
  reply: string;
  model?: string;
  mock?: boolean;
};

export type VeloIaHistoryMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

/**
 * O navegador nunca fala com o FastAPI. A URL e a chave ficam no servidor
 * Next.js. Em produção exigimos a chave para não chamar uma API aberta.
 */
export function isVeloIaConfigured() {
  if (!CONFIGURED_URL || !/^https?:\/\//i.test(CONFIGURED_URL)) return false;
  if (CONFIGURED_KEY) return true;
  return process.env.NODE_ENV !== "production";
}

export async function resolveVeloIaIdentity(
  request: NextRequest,
): Promise<VeloIaIdentity> {
  if (isSupabaseServerConfigured) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        return {
          conversationId: `user_${user.id}`,
          authenticated: true,
        };
      }
    } catch {
      // Sem sessão válida, seguimos como visitante.
    }
  }

  const existing = request.cookies.get(ANON_COOKIE)?.value;
  if (existing && ANON_TOKEN_RE.test(existing)) {
    return {
      conversationId: `anon_${existing}`,
      authenticated: false,
    };
  }

  const token = randomBytes(24).toString("base64url");
  return {
    conversationId: `anon_${token}`,
    authenticated: false,
    cookie: {
      name: ANON_COOKIE,
      value: token,
      options: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ANON_COOKIE_MAX_AGE,
      },
    },
  };
}

export function applyVeloIaIdentity(
  response: NextResponse,
  identity: VeloIaIdentity,
) {
  if (identity.cookie) {
    response.cookies.set(
      identity.cookie.name,
      identity.cookie.value,
      identity.cookie.options,
    );
  }
  return response;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!isVeloIaConfigured() || !CONFIGURED_URL) {
    throw new VeloIaRequestError(
      "A velo ia ainda não está conectada neste ambiente.",
      503,
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${CONFIGURED_URL}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(CONFIGURED_KEY ? { "X-API-Key": CONFIGURED_KEY } : {}),
        ...init.headers,
      },
    });

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data
          ? (data as { detail?: unknown }).detail
          : null;
      const message =
        typeof detail === "string" && detail.trim()
          ? detail.trim()
          : "A velo ia não conseguiu responder agora.";
      throw new VeloIaRequestError(message, response.status);
    }

    return data as T;
  } catch (error) {
    if (error instanceof VeloIaRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new VeloIaRequestError(
        "A velo ia demorou demais para responder. Tente de novo.",
        504,
      );
    }
    throw new VeloIaRequestError(
      "Não consegui falar com a velo ia agora. Tente de novo em instantes.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

export function veloIaChat(input: {
  conversationId: string;
  message: string;
}) {
  return requestJson<VeloIaChatResult>("/chat", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: input.conversationId,
      message: input.message,
    }),
  });
}

export function veloIaHistory(conversationId: string, limit = 60) {
  return requestJson<{ messages?: VeloIaHistoryMessage[] }>(
    `/history/${encodeURIComponent(conversationId)}?limit=${limit}`,
  );
}

export function veloIaClearHistory(conversationId: string) {
  return requestJson<{ ok?: boolean; deleted?: number }>(
    `/history/${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
}
