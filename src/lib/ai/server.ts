import { createHash, randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/supabase/server";

const CONFIGURED_URL = process.env.VELO_IA_API_URL?.trim().replace(/\/+$/, "");
const CONFIGURED_KEY = process.env.VELO_IA_API_KEY?.trim();
const CONFIGURED_HF_TOKEN = process.env.VELO_IA_HF_TOKEN?.trim();
const CONFIGURED_TIMEOUT = Number(process.env.VELO_IA_TIMEOUT_MS ?? "45000");
const MOCK_ENABLED = ["1", "true", "yes", "on", "sim"].includes(
  (process.env.VELO_IA_MOCK ?? "").trim().toLowerCase(),
);

// Groq é o backend gratuito alternativo ao FastAPI. A chave fica só no
// servidor Next.js; o navegador nunca fala com a Groq diretamente.
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();
const GROQ_MODEL =
  process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b";
const GROQ_BASE_URL = (
  process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1"
).replace(/\/+$/, "");

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

export type VeloIaChatMessage = {
  role: "user" | "assistant";
  content: string;
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

export function isGroqConfigured() {
  return Boolean(GROQ_API_KEY);
}

/**
 * Identificador curto e estável da conversa para separar históricos no
 * localStorage. Sem isso, duas contas no mesmo navegador veriam a conversa
 * uma da outra. O hash não permite recuperar o id original.
 */
export function veloIaStorageKey(conversationId: string) {
  return createHash("sha256").update(conversationId).digest("hex").slice(0, 20);
}

/**
 * Fallback de demonstração. Quando `VELO_IA_MOCK=1`, o proxy responde com
 * mensagens prontas se a API não estiver configurada ou estiver offline.
 * Não substitui a API real: se ela responder, a resposta real é usada.
 */
export function isVeloIaMock() {
  return MOCK_ENABLED;
}

const GROQ_SYSTEM_PROMPT = `Você é a velo ia, a amiga virtual do velo. Fale em português brasileiro, de um jeito informal, próximo, empático e bem-humorado — como uma amiga que manda mensagem no fim do dia, não como um atendente ou um terapeuta.

Como conversar:
- Escute antes de aconselhar. Valide o que a pessoa sentiu sem exagerar nem romantizar sofrimento.
- Responda curto: normalmente 1 a 3 parágrafos pequenos. Evite textão, sermão e frases prontas.
- Faça perguntas quando fizer sentido, mas não transforme toda resposta em interrogatório.
- Use humor leve quando a pessoa abrir espaço. Nunca tire sarro de algo sensível.
- Pode usar emojis com moderação. Não use markdown, listas enormes nem tom corporativo.
- Não invente fatos, lembranças ou detalhes sobre a pessoa. Se não souber, pergunte.
- Se perguntarem, seja transparente: você é uma IA, não uma pessoa de verdade.

Limites importantes:
- Você não substitui profissionais de saúde, psicólogos, médicos, advogados ou consultores financeiros. Não dê diagnósticos nem prescreva tratamentos.
- Em situações de risco, violência, autolesão ou pensamentos suicidas, acolha com calma, diga que a pessoa não está sozinha e incentive procurar ajuda imediata. No Brasil: CVV 188 (24h, gratuito) ou SAMU 192 em emergência. Se houver risco imediato, oriente ligar para o 190.
- Não peça nem armazene dados sensíveis como senha, CPF, endereço, dados bancários ou documentos.
- Não incentive isolamento, vingança, uso de drogas ou comportamentos perigosos.

Você tem memória das últimas mensagens desta conversa. Use esse contexto para lembrar do que a pessoa contou, sem repetir tudo de volta. Se a conversa estiver confusa, peça gentilmente para a pessoa esclarecer. Seu nome é sempre "velo ia".`;

const CRISIS_TERMS = [
  "suicid",
  "me matar",
  "me matando",
  "tirar minha vida",
  "tirar a minha vida",
  "acabar com tudo",
  "acabar com a minha vida",
  "me cortar",
  "me machucar",
  "automutil",
  "não quero mais viver",
  "nao quero mais viver",
  "não vale a pena viver",
  "nao vale a pena viver",
  "sumir do mundo",
] as const;

const CRISIS_REPLY =
  "eu tô aqui com você, e o que você sentiu importa muito. 💛\n\n" +
  "quando a dor chega nesse ponto, não precisa atravessar isso sozinho. " +
  "no brasil, o CVV atende 24h de graça no 188 — por telefone, chat ou e-mail. " +
  "se houver risco agora, ligue 190; em emergência de saúde, 192 (SAMU).\n\n" +
  "se puder, avise uma pessoa de confiança e fique perto de alguém. " +
  "você não é um incômodo por pedir ajuda. quer me contar onde você está agora?";

function containsCrisisLanguage(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  return CRISIS_TERMS.some((term) => normalized.includes(term));
}

function sanitizeGroqHistory(value: unknown): VeloIaChatMessage[] {
  if (!Array.isArray(value)) return [];

  const history: VeloIaChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { role?: unknown; content?: unknown };
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string") continue;
    const content = row.content.trim();
    if (!content) continue;

    history.push({ role: row.role, content: content.slice(0, 2000) });
    if (history.length >= 10) break;
  }
  return history;
}

const MOCK_REPLIES = [
  "tô aqui. 💛 me conta um pouco mais do que tá acontecendo? não precisa resumir bonito, pode falar do jeito que vier.",
  "entendi. às vezes a cabeça embaralha tudo antes da gente conseguir nomear. o que mais tá pesando aí hoje?",
  "isso soa cansativo. você quer desabafar sem interrupção ou prefere que eu te ajude a pensar em um próximo passo pequeno?",
  "olha, não vou te dar uma frase pronta porque isso não resolve. mas eu tô prestando atenção. como você tá se sentindo agora, de verdade?",
  "faz sentido sentir isso. quer que eu fique aqui um pouco, só conversando, ou você precisa de uma ideia prática pra destravar o dia?",
] as const;

export function mockVeloIaReply(message: string): VeloIaChatResult {
  const text = message.toLowerCase();
  let reply: string;

  if (/(suicid|me matar|tirar minha vida|me machucar|automutil)/.test(text)) {
    reply =
      "eu tô aqui com você, e o que você sentiu importa muito. 💛\n\n" +
      "quando a dor chega nesse ponto, não precisa atravessar isso sozinho. " +
      "no brasil, o CVV atende 24h de graça no 188. se houver risco agora, " +
      "ligue 190; em emergência de saúde, 192 (SAMU).";
  } else if (/(ansios|ansiedade|dormir)/.test(text)) {
    reply =
      "ansiedade adora virar festa justo na hora de dormir, né? tenta não " +
      "brigar com o relógio. baixa a luz, deixa o celular um pouco de lado e " +
      "escolhe só uma coisa pequena pra resolver amanhã. uma noite ruim não " +
      "estraga tudo.";
  } else if (/(trabalho|chefe|emprego|entrevista)/.test(text)) {
    reply =
      "trabalho tem um jeito especial de ocupar a cabeça mesmo fora do " +
      "horário, né? quer me contar o que aconteceu ou prefere pensar juntos " +
      "em algo pequeno que te faça sentir mais no controle amanhã?";
  } else if (/(namor|crush|relacionamento|mensagem)/.test(text)) {
    reply =
      "essa espera de resposta é cruel. mas visualizar não é a mesma coisa " +
      "que ignorar de propósito. você tá com vontade de mandar outra mensagem " +
      "ou de respirar um pouco antes?";
  } else {
    reply = MOCK_REPLIES[message.length % MOCK_REPLIES.length];
  }

  return { reply, mock: true, model: "mock" };
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
        // O token do Hugging Face atribui a cota do ZeroGPU à conta e libera
        // modelos/adaptadores privados. Ele nunca é enviado ao navegador.
        ...(CONFIGURED_HF_TOKEN
          ? { Authorization: `Bearer ${CONFIGURED_HF_TOKEN}` }
          : {}),
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

/**
 * Resposta via Groq (OpenAI-compatible). O histórico vem do cliente, porque o
 * backend gratuito não tem banco: o chat-view guarda as últimas mensagens no
 * localStorage e envia junto. O servidor não confia no formato e sanitiza tudo.
 */
export async function groqChat(input: {
  message: string;
  history?: unknown;
}): Promise<VeloIaChatResult> {
  const message = input.message.trim();
  if (!message) {
    throw new VeloIaRequestError("Mensagem vazia.", 400);
  }

  // A camada determinística de segurança não depende do modelo.
  if (containsCrisisLanguage(message)) {
    return { reply: CRISIS_REPLY, model: "crisis", mock: false };
  }

  if (!GROQ_API_KEY) {
    throw new VeloIaRequestError(
      "A velo ia ainda não está conectada neste ambiente.",
      503,
    );
  }

  const history = sanitizeGroqHistory(input.history);
  const isGptOss = GROQ_MODEL.startsWith("openai/gpt-oss");
  const isQwen = GROQ_MODEL.startsWith("qwen/");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: GROQ_SYSTEM_PROMPT },
          ...history,
          { role: "user", content: message },
        ],
        temperature: 0.7,
        top_p: 0.95,
        max_completion_tokens: 800,
        // GPT-OSS e Qwen têm parâmetros de reasoning diferentes; mandar o
        // campo errado para o modelo errado resulta em 400.
        ...(isGptOss
          ? { reasoning_effort: "low", include_reasoning: false }
          : {}),
        ...(isQwen ? { reasoning_effort: "none" } : {}),
        stream: false,
      }),
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
        data && typeof data === "object" && "error" in data
          ? (data as { error?: { message?: unknown } }).error?.message
          : null;

      if (response.status === 429) {
        throw new VeloIaRequestError(
          "A velo ia está recebendo muitas mensagens. Espere um pouco.",
          429,
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new VeloIaRequestError(
          "A chave da Groq não foi aceita. Confira GROQ_API_KEY na Vercel.",
          503,
        );
      }
      throw new VeloIaRequestError(
        typeof detail === "string" && detail.trim()
          ? "A Groq não conseguiu responder agora. Tente de novo."
          : "A velo ia não conseguiu responder agora. Tente de novo.",
        502,
      );
    }

    const reply =
      data && typeof data === "object" && "choices" in data
        ? (data as { choices?: Array<{ message?: { content?: unknown } }> })
            .choices?.[0]?.message?.content
        : null;
    if (typeof reply !== "string" || !reply.trim()) {
      throw new VeloIaRequestError(
        "A velo ia não conseguiu responder agora. Tente de novo.",
        502,
      );
    }

    const model =
      data && typeof data === "object" && "model" in data
        ? (data as { model?: unknown }).model
        : null;

    return {
      reply: reply.trim(),
      model: typeof model === "string" ? model : GROQ_MODEL,
      mock: false,
    };
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
