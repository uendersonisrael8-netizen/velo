"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  ArrowLeft,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";
import {
  mapHistoryMessages,
  VELO_IA_NAME,
  VELO_IA_WELCOME_MESSAGE,
  type VeloIaMessage,
} from "@/lib/ai/constants";
import { cn, createId } from "@/lib/utils";

/* ------------------------------------------------------------------------- *
 * Tipos mínimos da Web Speech API. O TypeScript do navegador cobre só parte
 * dela, então descrevemos aqui o que usamos de fato.
 * ------------------------------------------------------------------------- */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
};
type RecognitionResults = {
  length: number;
  [index: number]: RecognitionResult;
};
type RecognitionEvent = {
  resultIndex: number;
  results: RecognitionResults;
};
type RecognitionErrorEvent = { error: string };

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => Recognition;

type Phase = "idle" | "listening" | "thinking" | "speaking" | "ended";
type Notice = "microphone" | "unsupported" | "network" | null;

const HISTORY_STORAGE_PREFIX = "velo-ia:voice:";
const HISTORY_CONTEXT_LIMIT = 20;
const HISTORY_STORAGE_LIMIT = 40;
const HISTORY_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function readVoiceHistory(storageKey: string): VeloIaMessage[] {
  if (!HISTORY_KEY_PATTERN.test(storageKey)) return [];
  try {
    const raw = window.localStorage.getItem(
      HISTORY_STORAGE_PREFIX + storageKey,
    );
    if (!raw) return [];
    return mapHistoryMessages(JSON.parse(raw));
  } catch {
    return [];
  }
}

function writeVoiceHistory(storageKey: string, messages: VeloIaMessage[]) {
  if (!HISTORY_KEY_PATTERN.test(storageKey)) return;
  try {
    const payload = messages.slice(-HISTORY_STORAGE_LIMIT);
    window.localStorage.setItem(
      HISTORY_STORAGE_PREFIX + storageKey,
      JSON.stringify(payload),
    );
  } catch {
    // Modo privado ou cota cheia: a conversa segue só nesta sessão.
  }
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Tira da resposta tudo que soa estranho quando lido em voz alta: markdown,
 * links e emojis. O texto continua no histórico, falado e escrito.
 */
const SPEECH_NOISE_RE =
  /https?:\/\/\S+|`{1,3}|[*_#>~]|(?:\r?\n){2,}|[\u{1F000}-\u{1FAFF}\u{1FC00}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}\u{200D}]/gu;

function cleanForSpeech(text: string) {
  return text
    .replace(SPEECH_NOISE_RE, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Divide a resposta em pedaços curtos. O Chrome corta falas longas (acima de
 * ~15 s) e uma resposta inteira num único `utterance` some no meio.
 */
function chunkForSpeech(text: string, maxLength = 180) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }
    if (`${current} ${word}`.length <= maxLength) {
      current += ` ${word}`;
      continue;
    }
    chunks.push(current);
    current = word;
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

function pickPortugueseVoice(voices: SpeechSynthesisVoice[]) {
  const portuguese = voices.filter((voice) => /^pt\b|^pt-/i.test(voice.lang));
  if (!portuguese.length) return null;
  const preferred = portuguese.find((voice) =>
    /luciana|francisca|catarina|maria|google|natural|premium/i.test(voice.name),
  );
  return preferred ?? portuguese[0] ?? null;
}

function SpeechBubble({ message }: { message: VeloIaMessage }) {
  const isUser = message.role === "user";
  const time = formatTime(message.createdAt);

  return (
    <div
      className={cn(
        "animate-fade-in flex items-end gap-2.5",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? (
        <span className="shrink-0 rounded-full bg-accent/15 p-1.5 text-accent">
          <Sparkles className="size-3.5" strokeWidth={2} />
        </span>
      ) : null}
      <div
        className={cn(
          "flex min-w-0 max-w-[84%] flex-col md:max-w-[72%]",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "rounded-[22px] px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm",
            isUser
              ? "rounded-br-[7px] bg-accent text-[#0a0a0a]"
              : "rounded-bl-[7px] border border-line bg-surface text-ink",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {time ? (
          <p className="mt-1 px-1 text-[9.5px] tabular-nums text-muted">
            {time}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Waveform() {
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((bar) => (
        <span
          key={bar}
          className="voice-bar h-5 w-[3px] rounded-full bg-current"
        />
      ))}
    </span>
  );
}

export function VoiceCallView() {
  const { toast } = useToast();

  const [messages, setMessages] = useState<VeloIaMessage[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState<Notice>(null);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [callSeconds, setCallSeconds] = useState(0);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<VeloIaMessage[]>([]);

  const recognitionRef = useRef<Recognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  const phaseRef = useRef<Phase>("idle");
  const activeRef = useRef(false);
  const mutedRef = useRef(false);
  const speakerRef = useRef(true);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);
  const sendingRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speechTokenRef = useRef(0);

  // Referências mutáveis quebram o ciclo entre "ouvir" e "falar": cada função
  // chama a outra sem depender de qual render a criou.
  const startListeningRef = useRef<() => void>(() => undefined);
  const speakRef = useRef<(text: string) => void>(() => undefined);
  const stopSpeakingRef = useRef<() => void>(() => undefined);
  const sendRef = useRef<(text: string) => void>(() => undefined);

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const applyMessages = useCallback((next: VeloIaMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    if (storageKey) writeVoiceHistory(storageKey, next);
  }, [storageKey]);

  const clearTimer = useCallback((ref: typeof restartRef) => {
    if (ref.current) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  /* ----------------------------- histórico ------------------------------ */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      let nextKey: string | null = null;
      try {
        nextKey =
          window.localStorage.getItem("velo-ia:storage-key") ??
          createId("voice");
        window.localStorage.setItem("velo-ia:storage-key", nextKey);
      } catch {
        nextKey = createId("voice");
      }
      if (cancelled) return;
      setStorageKey(nextKey);

      try {
        const response = await fetch("/api/ai/history", {
          cache: "no-store",
        });
        const data = (await response
          .json()
          .catch(() => null)) as {
          ok?: boolean;
          storageKey?: string;
          conversationId?: string | null;
          messages?: unknown;
        } | null;

        if (cancelled) return;

        const serverKey =
          typeof data?.storageKey === "string" && data.storageKey
            ? data.storageKey
            : nextKey;
        setStorageKey(serverKey);

        if (typeof data?.conversationId === "string" && data.conversationId) {
          conversationIdRef.current = data.conversationId;
          applyMessages(mapHistoryMessages(data.messages));
          return;
        }

        const local = readVoiceHistory(serverKey);
        if (local.length) applyMessages(local);
      } catch {
        if (cancelled) return;
        const local = readVoiceHistory(nextKey);
        if (local.length) applyMessages(local);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // A conversa é carregada uma vez; `applyMessages` muda com a storageKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------- relógio da chamada ------------------------ */

  useEffect(() => {
    if (phase === "ended") return;
    const timer = setInterval(() => {
      if (activeRef.current) setCallSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase]);

  /* ------------------------------- vozes ------------------------------- */

  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;

    const load = () => synth.getVoices();
    load();
    synth.addEventListener?.("voiceschanged", load);
    return () => synth.removeEventListener?.("voiceschanged", load);
  }, []);

  /* ------------------------------ escuta ------------------------------- */

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    clearTimer(restartRef);

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Já estava parado.
      }
    }
    setInterim("");
  }, [clearTimer]);

  const startListening = useCallback(() => {
    if (!activeRef.current || mutedRef.current) return;
    if (listeningRef.current || speakingRef.current) return;
    if (recognitionRef.current) return;

    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    let recognition: Recognition;
    try {
      recognition = new Ctor();
    } catch {
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "pt-BR";
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      listeningRef.current = true;
      updatePhase("listening");
    };

    recognition.onresult = (event) => {
      let finalChunk = "";
      let interimChunk = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) finalChunk += text;
        else interimChunk += text;
      }

      setInterim(interimChunk || finalChunk);

      if (finalChunk.trim()) {
        const text = finalChunk.trim();
        setInterim("");
        // Para a escuta antes de mandar: o Chrome ainda pode entregar o
        // resultado final e reabrir a sessão sozinho.
        stopListening();
        void sendRef.current(text);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        mutedRef.current = true;
        activeRef.current = false;
        setMuted(true);
        setNotice("microphone");
        updatePhase("idle");
        return;
      }

      if (event.error === "network") {
        setNotice("network");
      }
    };

    recognition.onend = () => {
      // O Chrome encerra a sessão sozinho depois de alguns segundos em
      // silêncio. Enquanto a chamada estiver ativa, a escuta recomeça.
      recognitionRef.current = null;
      listeningRef.current = false;
      if (!activeRef.current || mutedRef.current) {
        updatePhase("idle");
        return;
      }
      if (speakingRef.current || sendingRef.current) return;
      clearTimer(restartRef);
      restartRef.current = setTimeout(() => {
        startListeningRef.current();
      }, 260);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [clearTimer, stopListening, updatePhase]);

  /* -------------------------------- fala ------------------------------- */

  const stopSpeaking = useCallback(() => {
    speechTokenRef.current += 1;
    speakingRef.current = false;
    clearTimer(resumeRef);

    const synth = window.speechSynthesis;
    if (synth) {
      try {
        synth.cancel();
      } catch {
        // Síntese indisponível.
      }
    }
  }, [clearTimer]);

  const speak = useCallback(
    (text: string) => {
      const clean = cleanForSpeech(text);
      if (!clean) return;

      const synth = window.speechSynthesis;
      if (!synth || !speakerRef.current) {
        if (activeRef.current && !mutedRef.current) {
          clearTimer(resumeRef);
          resumeRef.current = setTimeout(() => {
            startListeningRef.current();
          }, 200);
        }
        return;
      }

      stopListening();
      stopSpeaking();

      speakingRef.current = true;
      updatePhase("speaking");

      const token = speechTokenRef.current;
      const chunks = chunkForSpeech(clean);
      const voice = pickPortugueseVoice(synth.getVoices());

      const finish = () => {
        if (token !== speechTokenRef.current) return;
        speakingRef.current = false;
        if (!activeRef.current || mutedRef.current) {
          updatePhase("idle");
          return;
        }
        // Pequena folga para a cauda da fala não voltar transcrita.
        clearTimer(resumeRef);
        resumeRef.current = setTimeout(() => {
          startListeningRef.current();
        }, 420);
      };

      const speakChunk = (index: number) => {
        if (token !== speechTokenRef.current) return;
        if (index >= chunks.length) {
          finish();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index] ?? "");
        utterance.lang = "pt-BR";
        utterance.rate = 1.04;
        utterance.pitch = 1.02;
        if (voice) utterance.voice = voice;
        utterance.onend = () => speakChunk(index + 1);
        utterance.onerror = () => speakChunk(index + 1);

        try {
          synth.speak(utterance);
        } catch {
          finish();
        }
      };

      // `cancel` seguido de `speak` no mesmo tick faz o Chrome engolir a fala.
      setTimeout(() => speakChunk(0), 60);
    },
    [clearTimer, stopListening, stopSpeaking, updatePhase],
  );

  /* ------------------------------- envio ------------------------------- */

  const sendMessage = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;

      sendingRef.current = true;
      setErrorMessage(null);
      stopListening();
      stopSpeaking();
      setInterim("");

      const history = messagesRef.current
        .filter((message) => message.content.trim())
        .slice(-HISTORY_CONTEXT_LIMIT)
        .map((message) => ({
          role: message.role,
          content: message.content,
        }));

      const optimistic: VeloIaMessage = {
        id: createId("voice-msg"),
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      };
      applyMessages([...messagesRef.current, optimistic]);

      updatePhase("thinking");

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            history,
            ...(conversationIdRef.current
              ? { conversationId: conversationIdRef.current }
              : {}),
          }),
        });

        const data = (await response
          .json()
          .catch(() => null)) as {
          ok?: boolean;
          reply?: string;
          conversationId?: string | null;
          storage?: "local" | "server";
          error?: string;
        } | null;

        if (!response.ok || !data?.ok || typeof data.reply !== "string") {
          throw new Error(
            data?.error ?? "A velo ia não respondeu agora.",
          );
        }

        if (typeof data.conversationId === "string" && data.conversationId) {
          conversationIdRef.current = data.conversationId;
        }

        const reply = data.reply.trim();
        const assistant: VeloIaMessage = {
          id: createId("voice-msg"),
          role: "assistant",
          content: reply,
          createdAt: new Date().toISOString(),
        };
        applyMessages([...messagesRef.current, assistant]);

        speak(reply);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não consegui falar com a velo ia agora.";
        setErrorMessage(message);
        toast(message, "error");

        if (activeRef.current && !mutedRef.current) {
          updatePhase("idle");
          clearTimer(resumeRef);
          resumeRef.current = setTimeout(() => {
            startListeningRef.current();
          }, 400);
        } else {
          updatePhase("idle");
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [
      applyMessages,
      clearTimer,
      speak,
      stopListening,
      stopSpeaking,
      toast,
      updatePhase,
    ],
  );

  /* --------------------- gravação (Firefox / Android) ------------------- */

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      if (!blob.size) {
        setErrorMessage("Não consegui capturar sua voz. Tente de novo.");
        updatePhase("idle");
        return;
      }
      if (blob.size > 6 * 1024 * 1024) {
        setErrorMessage("O áudio ficou muito longo. Fale um pouco menos.");
        updatePhase("idle");
        return;
      }

      updatePhase("thinking");

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("falha ao ler o áudio"));
          reader.readAsDataURL(blob);
        });

        const response = await fetch("/api/ai/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: dataUrl,
            mimeType: blob.type || "audio/webm",
          }),
        });

        const data = (await response
          .json()
          .catch(() => null)) as { ok?: boolean; text?: string; error?: string } | null;

        if (!response.ok || !data?.ok || typeof data.text !== "string") {
          throw new Error(data?.error ?? "Não consegui transcrever o áudio.");
        }

        const text = data.text.trim();
        if (!text) {
          setErrorMessage("Não entendi o áudio. Tente falar de novo.");
          updatePhase("idle");
          return;
        }

        void sendRef.current(text);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Não consegui transcrever o áudio agora.";
        setErrorMessage(message);
        toast(message, "error");
        updatePhase("idle");
      }
    },
    [toast, updatePhase],
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Já parou.
      }
    }
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!activeRef.current || mutedRef.current) return;
    if (listeningRef.current || speakingRef.current) return;
    if (recorderRef.current) return;

    if (typeof MediaRecorder === "undefined") {
      setNotice("unsupported");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      recordStreamRef.current = stream;

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined,
      );
      recorderRef.current = recorder;
      recordChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) recordChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        const type = recorder.mimeType || mimeType || "audio/webm";
        void transcribeBlob(new Blob(chunks, { type }));
      };

      recorder.onerror = () => {
        setErrorMessage("Não consegui gravar o áudio. Tente de novo.");
        stopRecording();
        updatePhase("idle");
      };

      recorder.start();
      listeningRef.current = true;
      updatePhase("listening");
    } catch {
      mutedRef.current = true;
      activeRef.current = false;
      setMuted(true);
      setNotice("microphone");
      updatePhase("idle");
    }
  }, [stopRecording, transcribeBlob, updatePhase]);

  /* --------------------------- ciclo da chamada ------------------------ */

  const startCall = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    mutedRef.current = false;
    speakerRef.current = speakerOn;
    setMuted(false);
    setNotice(null);
    setErrorMessage(null);
    setCallSeconds(0);
    updatePhase("listening");

    if (getRecognitionCtor()) startListening();
    else void startRecording();
  }, [speakerOn, startListening, startRecording, updatePhase]);

  const endCall = useCallback(() => {
    activeRef.current = false;
    mutedRef.current = false;
    listeningRef.current = false;
    stopListening();
    stopSpeaking();
    stopRecording();
    setMuted(false);
    setInterim("");
    setDraft("");
    updatePhase("ended");
  }, [stopListening, stopRecording, stopSpeaking, updatePhase]);

  const toggleMute = useCallback(() => {
    if (!activeRef.current) {
      startCall();
      return;
    }

    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);

    if (next) {
      stopListening();
      stopRecording();
      updatePhase("idle");
      return;
    }

    setNotice(null);
    if (getRecognitionCtor()) startListening();
    else void startRecording();
  }, [startCall, startListening, startRecording, stopListening, stopRecording, updatePhase]);

  const toggleSpeaker = useCallback(() => {
    const next = !speakerRef.current;
    speakerRef.current = next;
    setSpeakerOn(next);
    if (!next) stopSpeaking();
  }, [stopSpeaking]);

  const interrupt = useCallback(() => {
    if (phaseRef.current !== "speaking") return;
    stopSpeaking();
    updatePhase("idle");
    if (activeRef.current && !mutedRef.current) {
      clearTimer(resumeRef);
      resumeRef.current = setTimeout(() => {
        startListeningRef.current();
      }, 160);
    }
  }, [clearTimer, stopSpeaking, updatePhase]);

  const handleOrb = useCallback(() => {
    switch (phaseRef.current) {
      case "ended":
        startCall();
        return;
      case "thinking":
        return;
      case "speaking":
        interrupt();
        return;
      case "listening":
        toggleMute();
        return;
      default:
        if (!activeRef.current) startCall();
        else if (mutedRef.current) toggleMute();
        else if (getRecognitionCtor()) startListening();
        else void startRecording();
    }
  }, [interrupt, startCall, startListening, startRecording, toggleMute]);

  const handleSendText = useCallback(() => {
    const text = draft.trim();
    if (!text || sendingRef.current) return;
    setDraft("");
    void sendMessage(text);
  }, [draft, sendMessage]);

  const handleDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      handleSendText();
    }
  };

  /* ------------------------------ efeitos ------------------------------ */

  // Mantém as referências mutáveis sempre no ponto: os callbacks de voz vivem
  // fora do React e não podem capturar um render antigo.
  useEffect(() => {
    startListeningRef.current = startListening;
    speakRef.current = speak;
    stopSpeakingRef.current = stopSpeaking;
    sendRef.current = (text: string) => {
      void sendMessage(text);
    };
  });

  // Mantém a conversa no fim.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: messages.length > 0 ? "smooth" : "auto",
    });
  }, [messages, interim, phase]);

  // Ao sair da tela, encerra tudo: microfone, síntese e timers.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      listeningRef.current = false;
      clearTimer(restartRef);
      clearTimer(resumeRef);
      speechTokenRef.current += 1;

      const recognition = recognitionRef.current;
      recognitionRef.current = null;
      if (recognition) {
        recognition.onend = null;
        try {
          recognition.abort();
        } catch {
          // Já estava parado.
        }
      }

      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Já parou.
        }
      }
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;

      const synth = window.speechSynthesis;
      if (synth) {
        try {
          synth.cancel();
        } catch {
          // Síntese indisponível.
        }
      }
    };
  }, [clearTimer]);

  /* ------------------------------- render ------------------------------ */

  const callActive = phase !== "ended";
  const statusText =
    phase === "listening"
      ? "ouvindo você…"
      : phase === "thinking"
        ? "pensando…"
        : phase === "speaking"
          ? "velo ia está falando"
          : phase === "ended"
            ? "chamada encerrada"
            : muted
              ? "microfone pausado"
              : "pronta para ouvir";

  const orbAction =
    phase === "ended"
      ? "iniciar chamada"
      : phase === "speaking"
        ? "interromper"
        : phase === "thinking"
          ? "só um instante"
          : muted
            ? "continuar conversa"
            : "pausar escuta";

  return (
    <div className="chat-shell flex flex-col bg-paper text-ink">
      <header className="shrink-0 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-3">
          <Link
            href="/chat"
            aria-label="Voltar para a conversa em texto"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft className="size-4" strokeWidth={1.8} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="font-editorial text-[23px] leading-none tracking-[-0.04em] text-ink">
              {VELO_IA_NAME} · voz
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  phase === "listening"
                    ? "bg-emerald-500"
                    : phase === "thinking"
                      ? "bg-amber-500"
                      : phase === "speaking"
                        ? "bg-accent"
                        : phase === "ended"
                          ? "bg-muted"
                          : "bg-muted",
                )}
              />
              {statusText}
              {callActive ? (
                <span className="tabular-nums text-muted/70">
                  · {formatDuration(callSeconds)}
                </span>
              ) : null}
            </p>
          </div>

          <button
            type="button"
            onClick={toggleSpeaker}
            aria-pressed={speakerOn}
            aria-label={speakerOn ? "Silenciar a voz da velo ia" : "Ativar a voz da velo ia"}
            title={speakerOn ? "Silenciar a voz" : "Ativar a voz"}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink"
          >
            {speakerOn ? (
              <Volume2 className="size-4" strokeWidth={1.8} />
            ) : (
              <VolumeX className="size-4" strokeWidth={1.8} />
            )}
          </button>

          {callActive ? (
            <button
              type="button"
              onClick={endCall}
              aria-label="Encerrar chamada"
              title="Encerrar chamada"
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-red-300 text-red-500 transition hover:bg-red-50"
            >
              <PhoneOff className="size-4" strokeWidth={1.9} />
            </button>
          ) : null}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="log"
        aria-label="Conversa por voz com a velo ia"
      >
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3 px-4 pb-4 pt-5 md:px-8">
          {messages.length === 0 ? (
            <div className="animate-fade-in rounded-[22px] rounded-bl-[7px] border border-line bg-surface px-4 py-3 text-[13.5px] leading-relaxed text-ink shadow-sm">
              {VELO_IA_WELCOME_MESSAGE}
            </div>
          ) : (
            messages.map((message) => (
              <SpeechBubble key={message.id} message={message} />
            ))
          )}

          {interim ? (
            <div className="animate-fade-in flex justify-end">
              <div className="max-w-[84%] rounded-[22px] rounded-br-[7px] border border-dashed border-line-strong bg-elevated/60 px-4 py-2.5 text-[13.5px] italic leading-relaxed text-muted">
                {interim}
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <p
              role="status"
              className="mx-auto max-w-[520px] rounded-full bg-red-50 px-3 py-1.5 text-center text-[11.5px] text-red-600"
            >
              {errorMessage}
            </p>
          ) : null}

          {notice === "microphone" ? (
            <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-2 rounded-[20px] border border-line bg-surface px-4 py-3 text-center">
              <p className="text-[12.5px] text-ink">
                O microfone está bloqueado. Libere a permissão do microfone
                para conversar por voz.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setMuted(false);
                  mutedRef.current = false;
                  startCall();
                }}
                className="h-8 rounded-full border border-line px-3.5 text-[11.5px] font-medium text-ink transition hover:border-line-strong hover:bg-elevated"
              >
                Tentar de novo
              </button>
            </div>
          ) : null}

          {notice === "unsupported" ? (
            <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-1 rounded-[20px] border border-line bg-surface px-4 py-3 text-center">
              <p className="text-[12.5px] text-ink">
                Este navegador não tem ditado por voz. Dá para conversar por
                texto logo abaixo, ou abrir no Chrome.
              </p>
              <p className="text-[11px] text-muted">
                O Chrome no computador e no Android tem suporte completo.
              </p>
            </div>
          ) : null}

          {notice === "network" ? (
            <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-1 rounded-[20px] border border-line bg-surface px-4 py-3 text-center">
              <p className="text-[12.5px] text-ink">
                Não consegui acessar o ditado por voz. Confira sua conexão e
                tente de novo.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-paper/90 px-4 pb-3 pt-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto w-full max-w-[820px]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={handleOrb}
              disabled={phase === "thinking"}
              aria-label={orbAction}
              className={cn(
                "relative flex size-[124px] items-center justify-center rounded-full transition",
                phase === "thinking" && "cursor-wait",
              )}
            >
              {phase === "listening" ? (
                <>
                  <span className="voice-ripple absolute inset-0 rounded-full bg-accent/25" />
                  <span className="voice-ripple voice-ripple-late absolute inset-0 rounded-full bg-accent/20" />
                </>
              ) : null}

              <span className="absolute inset-[10px] rounded-full border border-line" />

              <span
                className={cn(
                  "relative flex size-[88px] items-center justify-center rounded-full transition-transform duration-300",
                  phase === "listening"
                    ? "scale-105 bg-gradient-to-br from-accent to-[#ff8a3d] text-[#0a0a0a] shadow-[0_18px_44px_-18px_rgba(255,138,61,0.75)]"
                    : phase === "speaking"
                      ? "bg-gradient-to-br from-accent to-[#ff8a3d] text-[#0a0a0a] shadow-[0_18px_44px_-18px_rgba(255,138,61,0.55)]"
                      : phase === "thinking"
                        ? "bg-elevated text-ink"
                        : "bg-elevated text-muted",
                )}
              >
                {phase === "speaking" ? (
                  <Waveform />
                ) : phase === "thinking" ? (
                  <Loader2 className="size-7 animate-spin" strokeWidth={1.9} />
                ) : phase === "ended" ? (
                  <PhoneOff className="size-7" strokeWidth={1.9} />
                ) : muted ? (
                  <MicOff className="size-7" strokeWidth={1.9} />
                ) : (
                  <Mic className="size-7" strokeWidth={1.9} />
                )}
              </span>
            </button>

            <p className="text-[11.5px] text-muted">
              {phase === "thinking"
                ? "pensando na resposta…"
                : phase === "speaking"
                  ? "toque para interromper"
                  : phase === "ended"
                    ? "toque para começar uma nova chamada"
                    : muted
                      ? "microfone pausado · toque para continuar"
                      : "toque para falar com a velo ia"}
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={!muted}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11.5px] font-medium transition",
                  muted
                    ? "border-line text-muted hover:border-line-strong hover:text-ink"
                    : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/15",
                )}
              >
                {muted ? (
                  <MicOff className="size-3.5" strokeWidth={1.9} />
                ) : (
                  <Mic className="size-3.5" strokeWidth={1.9} />
                )}
                {muted ? "microfone" : "ouvindo"}
              </button>

              <button
                type="button"
                onClick={() => setKeyboardOpen((open) => !open)}
                aria-pressed={keyboardOpen}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11.5px] font-medium transition",
                  keyboardOpen
                    ? "border-line-strong bg-elevated text-ink"
                    : "border-line text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <Keyboard className="size-3.5" strokeWidth={1.9} />
                digitar
              </button>
            </div>
          </div>

          {keyboardOpen ? (
            <div className="animate-fade-in mt-3 flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleDraftKeyDown}
                rows={1}
                maxLength={2000}
                placeholder="escreva sua mensagem…"
                aria-label="Mensagem por texto"
                className="max-h-[120px] min-h-[44px] flex-1 resize-none rounded-[20px] border border-line bg-surface px-4 py-2.5 text-[13.5px] text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/50"
              />
              <button
                type="button"
                onClick={handleSendText}
                disabled={!draft.trim() || phase === "thinking"}
                aria-label="Enviar mensagem"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="size-4" strokeWidth={2} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}