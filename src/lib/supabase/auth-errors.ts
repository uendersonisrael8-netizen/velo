/**
 * Converte mensagens do Supabase Auth em texto amigável.
 *
 * O fallback é sempre genérico: detalhes internos do provedor não devem
 * aparecer para o usuário. Em desenvolvimento, o texto original vai para o
 * console para facilitar o diagnóstico.
 */
export function authErrorMessage(message?: string): string {
  const fallback = "Não foi possível concluir. Tente de novo.";
  if (!message) return fallback;

  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (normalized.includes("user already registered")) {
    return "Esse e-mail já tem uma conta. Tente entrar.";
  }
  if (
    normalized.includes("signups not allowed") ||
    normalized.includes("signup is disabled")
  ) {
    return "O cadastro por e-mail está desativado no Supabase.";
  }
  if (
    normalized.includes("invalid email") ||
    (normalized.includes("email address") && normalized.includes("invalid"))
  ) {
    return "Informe um e-mail válido.";
  }
  if (
    normalized.includes("email link is invalid") ||
    normalized.includes("token has expired") ||
    normalized.includes("otp_expired")
  ) {
    return "O link expirou. Tente de novo.";
  }
  if (normalized.includes("password") && normalized.includes("least")) {
    return "A senha não atende aos requisitos mínimos.";
  }
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("security purposes") ||
    normalized.includes("over_email_send_rate_limit")
  ) {
    return "Muitas tentativas. Espere um pouco e tente de novo.";
  }
  if (normalized.includes("duplicate") && normalized.includes("handle")) {
    return "Esse handle já está em uso. Escolha outro.";
  }
  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Falha de conexão. Verifique sua internet.";
  }
  if (normalized.includes("provider") && normalized.includes("not enabled")) {
    return "Ative o provider Google em Authentication → Providers no Supabase.";
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn("[velo] auth error:", message);
  }
  return fallback;
}

/** Erros do Supabase que merecem um status HTTP diferente de 400. */
export function authErrorStatus(message?: string) {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("invalid login credentials")) return 401;
  if (normalized.includes("email not confirmed")) return 403;
  if (
    normalized.includes("rate limit") ||
    normalized.includes("too many") ||
    normalized.includes("security purposes")
  ) {
    return 429;
  }
  return 400;
}
