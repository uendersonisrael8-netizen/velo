/**
 * Transcrição de áudio (STT) do modo de voz da velo ia.
 *
 * O caminho principal é a Web Speech API no navegador: transcreve em tempo
 * real, não custa nada e já vem com o ditado por voz do Chrome, Edge e Safari.
 * Este módulo é o plano B para onde o `SpeechRecognition` não existe — Firefox
 * e o WebView do app Android. O áudio gravado chega em base64 e segue para o
 * endpoint de transcrição da Groq (Whisper), que aceita o mesmo formato da
 * OpenAI.
 */

import { VeloIaRequestError } from "@/lib/ai/server";

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";

const TRANSCRIBE_BASE_URL = (
  process.env.VELO_IA_TRANSCRIBE_URL?.trim() || DEFAULT_BASE_URL
).replace(/\/+$/, "");

const TRANSCRIBE_API_KEY = process.env.GROQ_API_KEY?.trim();

const TRANSCRIBE_MODEL =
  process.env.VELO_IA_TRANSCRIBE_MODEL?.trim() || "whisper-large-v3-turbo";

function resolveTimeout() {
  const value = Number(process.env.VELO_IA_TRANSCRIBE_TIMEOUT_MS ?? "30000");
  if (!Number.isFinite(value)) return 30_000;
  return Math.min(60_000, Math.max(5_000, value));
}

/** Tamanho máximo do áudio aceito, em bytes, antes do base64. */
export const VELO_IA_AUDIO_MAX_BYTES = 4 * 1024 * 1024;

/** Extensão de arquivo coerente com o tipo MIME, esperada pelo Whisper. */
const MIME_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

const ALLOWED_MIME_TYPES = new Set([
  ...Object.keys(MIME_EXTENSIONS),
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
]);

export function isTranscriptionConfigured() {
  return Boolean(TRANSCRIBE_API_KEY);
}

function normalizeMimeType(value: unknown) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!raw) return "audio/webm";
  const base = raw.split(";")[0]?.trim() ?? "";
  return ALLOWED_MIME_TYPES.has(raw) || MIME_EXTENSIONS[base] ? raw : "";
}

function decodeBase64(value: string) {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s+/g, "");
  if (!clean) {
    throw new VeloIaRequestError("O áudio veio vazio.", 400);
  }
  if (clean.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(clean)) {
    throw new VeloIaRequestError("Não consegui ler o áudio enviado.", 400);
  }

  const bytes = Buffer.from(clean, "base64");
  if (!bytes.length) {
    throw new VeloIaRequestError("O áudio veio vazio.", 400);
  }
  if (bytes.length > VELO_IA_AUDIO_MAX_BYTES) {
    throw new VeloIaRequestError("O áudio é muito longo.", 413);
  }
  return bytes;
}

/**
 * Converte o áudio gravado em texto. Devolve string vazia quando a pessoa não
 * falou nada — o cliente trata isso como "tente de novo", não como erro.
 */
export async function transcribeAudio(input: {
  audioBase64: string;
  mimeType?: unknown;
}): Promise<string> {
  if (!TRANSCRIBE_API_KEY) {
    throw new VeloIaRequestError(
      "A transcrição de voz não está configurada neste ambiente.",
      503,
    );
  }

  const mimeType = normalizeMimeType(input.mimeType) || "audio/webm";
  const bytes = decodeBase64(input.audioBase64);

  const form = new FormData();
  const extension = MIME_EXTENSIONS[mimeType.split(";")[0] ?? ""] ?? "webm";
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    `velo-ia.${extension}`,
  );
  form.append("model", TRANSCRIBE_MODEL);
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), resolveTimeout());

  try {
    const response = await fetch(`${TRANSCRIBE_BASE_URL}/audio/transcriptions`, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${TRANSCRIBE_API_KEY}` },
      body: form,
    });

    const raw = await response.text();
    let data: unknown = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = null;
      }
    }

    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "error" in data
          ? (data as { error?: { message?: unknown } }).error?.message
          : null;
      const detailText = typeof detail === "string" ? detail : "";
      console.error(
        "[velo ia] transcrição respondeu",
        response.status,
        detailText,
      );

      if (response.status === 429) {
        throw new VeloIaRequestError(
          "A velo ia está recebendo muitos áudios. Espere um pouco.",
          429,
          { retryable: true },
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new VeloIaRequestError(
          "A chave de transcrição não foi aceita. Confira GROQ_API_KEY no servidor.",
          503,
        );
      }
      if (response.status === 413) {
        throw new VeloIaRequestError("O áudio é muito longo.", 413);
      }
      throw new VeloIaRequestError(
        "Não consegui transcrever o áudio agora.",
        502,
        { retryable: true },
      );
    }

    const text =
      data && typeof data === "object" && "text" in data
        ? (data as { text?: unknown }).text
        : null;

    return typeof text === "string" ? text.trim() : "";
  } catch (error) {
    if (error instanceof VeloIaRequestError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new VeloIaRequestError(
        "A transcrição demorou demais. Tente de novo.",
        504,
        { retryable: true },
      );
    }
    throw new VeloIaRequestError(
      "Não consegui transcrever o áudio agora.",
      502,
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}