"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ArrowUp, CloudOff, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/components/providers/toast-provider";
import {
  mapHistoryMessages,
  VELO_IA_NAME,
  VELO_IA_WELCOME_MESSAGE,
  type VeloIaMessage,
} from "@/lib/ai/constants";
import { cn, createId } from "@/lib/utils";

type ChatStatus = "loading" | "ready" | "offline";
type OfflineReason = "not_configured" | "unreachable";

type HistoryResponse = {
  ok?: boolean;
  configured?: boolean;
  messages?: unknown;
  error?: string;
};

type ChatResponse = {
  ok?: boolean;
  reply?: string;
  mock?: boolean;
  error?: string;
};

const SUGGESTIONS = [
  "tô ansioso com amanhã",
  "me ajuda a escolher um vídeo",
  "só quero conversar um pouco",
];

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function VeloIaAvatar({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_20%,#ff9a6c,#ef430c_55%,#7a1e00)] text-[#0a0a0a] shadow-[0_8px_24px_rgba(239,67,12,0.24)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Sparkles
        style={{ width: size * 0.44, height: size * 0.44 }}
        strokeWidth={2}
      />
    </span>
  );
}

function MessageBubble({ message }: { message: VeloIaMessage }) {
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
        // O horário fica abaixo do balão; sem essa margem o avatar desceria
        // junto com ele e perderia o alinhamento com a bolha.
        <span className={cn("shrink-0", time && "mb-[18px]")}>
          <VeloIaAvatar size={30} />
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
            "rounded-[22px] px-4 py-3 text-[14px] leading-relaxed shadow-sm",
            isUser
              ? "rounded-br-[7px] bg-accent text-[#0a0a0a]"
              : "rounded-bl-[7px] border border-line bg-surface text-ink",
          )}
        >
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {time ? (
          <p className="mt-1 px-1 text-[9.5px] tabular-nums text-muted">{time}</p>
        ) : null}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="animate-fade-in flex items-end gap-2.5" aria-live="polite">
      <VeloIaAvatar size={30} />
      <div className="rounded-[22px] rounded-bl-[7px] border border-line bg-surface px-4 py-3.5">
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
          <span className="typing-dot size-1.5 rounded-full bg-muted" />
        </span>
        <span className="sr-only">velo ia está digitando…</span>
      </div>
    </div>
  );
}

function LoadingBubbles() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex items-end gap-2.5">
        <span className="skeleton size-[30px] shrink-0 rounded-full" />
        <span className="skeleton h-[52px] w-[62%] rounded-[22px] rounded-bl-[7px]" />
      </div>
      <div className="flex justify-end">
        <span className="skeleton h-[44px] w-[42%] rounded-[22px] rounded-br-[7px]" />
      </div>
    </div>
  );
}

function OfflineNotice({
  reason,
  onRetry,
}: {
  reason: OfflineReason;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-3 rounded-[22px] border border-line bg-surface/70 px-5 py-5 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-elevated text-muted">
        <CloudOff className="size-[18px]" strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-[13px] font-semibold text-ink">
          {reason === "not_configured"
            ? "A velo ia ainda não está conectada."
            : "A velo ia não está disponível agora."}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          {reason === "not_configured"
            ? "O servidor de IA precisa ser configurado com VELO_IA_API_URL e VELO_IA_API_KEY. Enquanto isso, a tela fica pronta para quando a API estiver no ar."
            : "Pode ser uma oscilação momentânea. Tente de novo em instantes — sua conversa continua salva quando a API voltar."}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex h-9 items-center gap-2 rounded-full border border-line px-4 text-[11.5px] font-medium text-ink transition hover:border-line-strong hover:bg-elevated"
      >
        <RefreshCw className="size-3.5" strokeWidth={1.8} />
        Tentar de novo
      </button>
    </div>
  );
}

export function ChatView() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<VeloIaMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<ChatStatus>("loading");
  const [offlineReason, setOfflineReason] =
    useState<OfflineReason>("unreachable");
  const [sending, setSending] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [mock, setMock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/history", { cache: "no-store" });
      const data = (await response
        .json()
        .catch(() => null)) as HistoryResponse | null;

      if (!response.ok || !data || data.ok === false) {
        throw new Error(
          data?.error ?? "Não consegui carregar a conversa agora.",
        );
      }

      if (data.configured === false) {
        setOfflineReason("not_configured");
        setStatus("offline");
        return;
      }

      setMessages(mapHistoryMessages(data.messages));
      setStatus("ready");
    } catch {
      // O card de offline já explica a falha e oferece "Tentar de novo";
      // um alerta extra aqui só duplicaria a mensagem na tela.
      setOfflineReason("unreachable");
      setStatus("offline");
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- carrega o histórico do servidor uma vez no mount; os setState acontecem depois do fetch assíncrono */
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const retryHistory = () => {
    setStatus("loading");
    setError(null);
    void loadHistory();
  };

  // Mantém a conversa no fim sempre que chega mensagem ou o indicador aparece.
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: messages.length > 0 ? "smooth" : "auto",
    });
  }, [messages, sending, status]);

  // Cresce o campo junto com o texto, até um limite confortável.
  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [input]);

  // No desktop, o foco já começa no campo. No celular, evita abrir o teclado
  // sozinho e cobrir a conversa.
  useEffect(() => {
    if (status !== "ready") return;
    if (window.matchMedia("(min-width: 768px)").matches) {
      textareaRef.current?.focus();
    }
  }, [status]);

  useEffect(() => {
    if (!confirmClear) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setConfirmClear(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmClear]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending || status !== "ready") return;

    setError(null);
    const optimistic: VeloIaMessage = {
      id: createId("msg"),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimistic]);
    setInput("");
    setSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await response
        .json()
        .catch(() => null)) as ChatResponse | null;

      if (!response.ok || !data?.ok || typeof data.reply !== "string") {
        throw new Error(
          data?.error ?? "A velo ia não conseguiu responder agora.",
        );
      }

      setMock(Boolean(data.mock));
      setMessages((current) => [
        ...current,
        {
          id: createId("msg"),
          role: "assistant",
          content: data.reply as string,
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (sendError) {
      // A mensagem otimista sai da tela e volta para o campo, para a pessoa
      // tentar de novo sem perder o texto.
      setMessages((current) =>
        current.filter((message) => message.id !== optimistic.id),
      );
      setInput(text);
      const message =
        sendError instanceof Error
          ? sendError.message
          : "Não consegui falar com a velo ia agora.";
      setError(message);
      toast(message, "error");
    } finally {
      setSending(false);
    }
  }, [input, sending, status, toast]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendMessage();
    }
  };

  const clearConversation = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const response = await fetch("/api/ai/history", { method: "DELETE" });
      const data = (await response
        .json()
        .catch(() => null)) as { ok?: boolean; error?: string } | null;

      if (!response.ok || data?.ok === false) {
        throw new Error(data?.error ?? "Não consegui limpar a conversa.");
      }

      setMessages([]);
      setError(null);
      setConfirmClear(false);
      toast("Conversa limpa. Podemos começar de novo.");
    } catch (clearError) {
      toast(
        clearError instanceof Error
          ? clearError.message
          : "Não consegui limpar a conversa agora.",
        "error",
      );
    } finally {
      setClearing(false);
    }
  }, [clearing, toast]);

  const canSend = status === "ready" && !sending && input.trim().length > 0;
  const statusLabel =
    status === "ready"
      ? "online · amiga virtual"
      : status === "loading"
        ? "carregando conversa…"
        : "offline agora";

  return (
    <div className="chat-shell flex flex-col bg-paper text-ink">
      <header className="shrink-0 border-b border-line bg-paper/85 px-4 py-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto flex w-full max-w-[820px] items-center gap-3">
          <VeloIaAvatar size={42} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-editorial text-[25px] leading-none tracking-[-0.04em] text-ink">
                {VELO_IA_NAME}
              </h1>
              {mock ? (
                <span className="rounded-full border border-accent/30 bg-accent-dim px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-accent">
                  demo
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] text-muted">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "ready"
                    ? "bg-emerald-500"
                    : status === "loading"
                      ? "bg-amber-500"
                      : "bg-muted",
                )}
              />
              {statusLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={messages.length === 0 || clearing}
            aria-label="Limpar conversa"
            title="Limpar conversa"
            className="flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Trash2 className="size-4" strokeWidth={1.7} />
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="log"
        aria-label="Conversa com a velo ia"
      >
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-4 px-4 pb-6 pt-5 md:px-8">
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-line" />
            <span className="eyebrow text-[8px] text-muted">hoje</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <MessageBubble
            message={{
              id: "welcome",
              role: "assistant",
              content: VELO_IA_WELCOME_MESSAGE,
            }}
          />

          {status === "loading" ? <LoadingBubbles /> : null}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {sending ? <TypingBubble /> : null}

          {status === "offline" ? (
            <OfflineNotice
              reason={offlineReason}
              onRetry={retryHistory}
            />
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-line bg-paper/90 px-4 pb-3 pt-3 backdrop-blur-xl md:px-8">
        <div className="mx-auto w-full max-w-[820px]">
          {messages.length === 0 && status === "ready" ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setInput(suggestion);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] text-muted transition hover:border-line-strong hover:text-ink"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          ) : null}

          {error ? (
            <p
              className="mb-2 rounded-[12px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11.5px] leading-relaxed text-red-500 dark:text-red-300"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-[24px] border border-line bg-surface p-1.5 shadow-sm transition focus-within:border-line-strong"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              maxLength={2000}
              disabled={status !== "ready" || sending}
              placeholder={
                status === "ready"
                  ? "manda uma mensagem pra velo ia…"
                  : status === "loading"
                    ? "carregando a conversa…"
                    : "velo ia offline"
              }
              aria-label="Mensagem para a velo ia"
              className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-ink outline-none placeholder:text-muted/70 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Enviar mensagem"
              className={cn(
                "mb-0.5 flex size-10 shrink-0 items-center justify-center rounded-full transition",
                canSend
                  ? "bg-accent text-[#0a0a0a] hover:bg-ink hover:text-paper"
                  : "cursor-not-allowed bg-elevated text-muted",
              )}
            >
              <ArrowUp className="size-4" strokeWidth={2.2} />
            </button>
          </form>

          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[10px] text-muted">
            <span>
              {status === "offline"
                ? "a conversa volta quando a API estiver disponível"
                : "enter envia · shift + enter quebra linha"}
            </span>
            <span
              className={cn(
                "tabular-nums",
                input.length > 1800 && "text-accent",
              )}
            >
              {input.length}/2000
            </span>
          </div>
        </div>
      </div>

      {confirmClear ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/45 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="velo-ia-clear-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setConfirmClear(false);
          }}
        >
          <div className="w-full max-w-[360px] rounded-[24px] border border-line bg-paper p-6 shadow-2xl">
            <p className="eyebrow text-[8px] text-muted">velo ia</p>
            <h2
              id="velo-ia-clear-title"
              className="mt-2 font-editorial text-[28px] leading-[0.95] tracking-[-0.03em] text-ink"
            >
              limpar a conversa?
            </h2>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              A velo ia esquece o contexto recente e a conversa recomeça do zero.
              Essa ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                autoFocus
                className="h-10 flex-1 rounded-full border border-line text-[12px] font-medium text-ink transition hover:bg-elevated"
              >
                cancelar
              </button>
              <button
                type="button"
                onClick={() => void clearConversation()}
                disabled={clearing}
                className="h-10 flex-1 rounded-full bg-accent text-[12px] font-semibold text-[#0a0a0a] transition hover:bg-ink hover:text-paper disabled:opacity-60"
              >
                {clearing ? "limpando…" : "limpar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
