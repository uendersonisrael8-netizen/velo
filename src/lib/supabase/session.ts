import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

// O velo é uma rede aberta: feed, explorar, perfis públicos, login e cadastro
// podem ser vistos por qualquer visitante. Só estas rotas exigem sessão.
const PRIVATE_PATHS = ["/upload", "/profile", "/saved", "/direct"];

const PRIVATE_CACHE_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

function isPrivatePath(pathname: string) {
  return PRIVATE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function withSessionHeaders(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  for (const [key, value] of Object.entries(PRIVATE_CACHE_HEADERS)) {
    target.headers.set(key, value);
  }
  return target;
}

function redirectTo(request: NextRequest, pathname: string, session: NextResponse) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  return withSessionHeaders(session, NextResponse.redirect(target));
}

/**
 * Mantém a sessão do Supabase atualizada nas rotas privadas e bloqueia o
 * acesso no servidor antes do render. Rotas públicas (feed, explorar, perfis,
 * login e cadastro) não pagam o custo de validar JWT: o browser client cuida
 * da renovação enquanto o visitante navega.
 */
export async function updateSession(request: NextRequest) {
  // Sem configuração o app abre em modo prévia; não há sessão para validar.
  if (!url || !anonKey) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Tudo que não é privado é público — inclusive /auth/callback, que precisa
  // rodar antes de existir uma sessão.
  if (!isPrivatePath(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headersToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headersToSet).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // getClaims() valida a assinatura do JWT (localmente quando o projeto usa
  // chaves assimétricas) e renova a sessão se o token estiver perto de expirar.
  // Em caso de falha, a rota privada fecha por padrão.
  let isAuthenticated = false;
  try {
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    isAuthenticated = Boolean(claims?.sub) && claims?.is_anonymous !== true;
  } catch {
    isAuthenticated = false;
  }

  if (!isAuthenticated) {
    return redirectTo(request, "/login", response);
  }

  // Não redirecionamos quem já tem sessão para fora de /login e /signup.
  // O formulário faz isso no cliente quando o perfil carrega; assim evitamos
  // loop de redirect se a sessão existir mas o perfil ainda não estiver pronto.
  for (const [key, value] of Object.entries(PRIVATE_CACHE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
