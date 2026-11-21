export const VELO_IA_NAME = "velo ia";

export const VELO_IA_WELCOME_MESSAGE =
  "oi, eu sou a velo ia. 🌱\n\n" +
  "Pode falar do seu dia, desabafar, pedir uma ideia de vídeo ou só jogar conversa fora. " +
  "Eu lembro das últimas mensagens desta conversa — e você pode limpar tudo quando quiser.";

export type VeloIaRole = "user" | "assistant";

export type VeloIaMessage = {
  id: string;
  role: VeloIaRole;
  content: string;
  createdAt?: string;
  /** Data URL da imagem enviada. Não é persistida no localStorage. */
  image?: string;
  /** Indica se a resposta consultou a web em tempo real. */
  searched?: boolean;
  /** Fontes pesquisadas na web. */
  sources?: Array<{ title: string; url: string }>;
};

// Limites do anexo de imagem no chat. O cliente comprime para ~2 MB; o
// servidor aceita até 3 MB de bytes binários para não estourar o body da
// função da Vercel (limite de ~4,5 MB, e base64 cresce ~33%).
export const VELO_IA_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const VELO_IA_IMAGE_TARGET_BYTES = 2 * 1024 * 1024;
export const VELO_IA_IMAGE_MAX_DATA_URL_LENGTH = 4_400_000;

export type VeloIaHistoryPayload = {
  id?: number | string;
  role?: string;
  content?: string;
  created_at?: string;
};

export function mapHistoryMessages(value: unknown): VeloIaMessage[] {
  if (!Array.isArray(value)) return [];

  const messages: VeloIaMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") continue;
    const row = item as VeloIaHistoryPayload;
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string" || !row.content.trim()) continue;

    messages.push({
      id: row.id != null ? String(row.id) : `history-${index}`,
      role: row.role,
      content: row.content,
      createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
    });
  }
  return messages;
}
