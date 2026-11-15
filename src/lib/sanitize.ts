/**
 * Sanitização de texto para conteúdo escrito por pessoas.
 *
 * React já escapa HTML na renderização; esta camada remove caracteres de
 * controle, zero-width e bidirecionais que podem quebrar a interface, além de
 * normalizar o Unicode antes de gravar no banco. Senhas nunca passam por aqui:
 * espaços e caracteres especiais fazem parte da senha e devem ser preservados.
 */

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ZERO_WIDTH_CHARS = /[\u200b-\u200d\u2060\ufeff]/g;
const BIDI_CONTROL_CHARS = /[\u202a-\u202e\u2066-\u2069]/g;

export function normalizeEmail(value: string) {
  return value
    .normalize("NFKC")
    .replace(ZERO_WIDTH_CHARS, "")
    .trim()
    .toLowerCase();
}

export function sanitizeText(
  value: string,
  options: { multiline?: boolean; maxLength?: number } = {},
) {
  const { multiline = false, maxLength } = options;

  let clean = value
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS, "")
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(BIDI_CONTROL_CHARS, "");

  if (multiline) {
    clean = clean
      .replace(/[^\S\n]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n");
  } else {
    clean = clean.replace(/\s+/g, " ");
  }

  clean = clean.trim();
  return typeof maxLength === "number" ? clean.slice(0, maxLength) : clean;
}

/**
 * Só permite links externos http(s). Usado antes de renderizar um link de
 * perfil para impedir esquemas como `javascript:` vindos de dados antigos.
 */
export function safeExternalUrl(value: string | null | undefined) {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
