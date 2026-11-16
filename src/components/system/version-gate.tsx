"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { ANDROID_APK_URL } from "@/lib/site";
import { isVersionBelow, WEB_APP_VERSION } from "@/lib/version";

type GateState = "checking" | "ready" | "outdated";

/**
 * O APK 1.0.0 foi publicado antes do plugin `@capacitor/app` e não consegue
 * reportar a própria versão. Sem esse fallback, ele escaparia da atualização
 * obrigatória para sempre, porque o WebView carrega o site novo.
 */
const LEGACY_NATIVE_VERSION = "1.0.0";

type VersionPayload = {
  versao_minima?: unknown;
  link_loja?: unknown;
  mensagem?: unknown;
};

function safeHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Verificação de atualização obrigatória.
 *
 * No app Android usa a versão nativa (`App.getInfo()`); no PWA usa
 * `NEXT_PUBLIC_APP_VERSION`. Se o endpoint falhar, o app segue normalmente:
 * uma falha de rede não pode virar bloqueio total. Quando a versão está abaixo
 * da mínima, um modal fixo cobre a interface e prende o foco até a atualização.
 */
export function VersionGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [native, setNative] = useState(false);
  const [currentVersion, setCurrentVersion] = useState(WEB_APP_VERSION);
  const [minimumVersion, setMinimumVersion] = useState("1.0.0");
  const [storeUrl, setStoreUrl] = useState<string>(ANDROID_APK_URL);
  const [message, setMessage] = useState("Atualize o velo para continuar.");
  const actionRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const startedAt = Date.now();

    const resolveCurrentVersion = async () => {
      let capacitor: {
        isNativePlatform: () => boolean;
        isPluginAvailable: (name: string) => boolean;
      } | null = null;

      try {
        const core = await import("@capacitor/core");
        capacitor = core.Capacitor;
        if (!capacitor.isNativePlatform()) return WEB_APP_VERSION;

        if (active) setNative(true);
        const { App } = await import("@capacitor/app");
        const info = await App.getInfo();
        return info.version || WEB_APP_VERSION;
      } catch {
        // APK antigo sem o plugin nativo: assume 1.0.0 para o gate alcançar
        // esse build. Se o plugin existe mas falhou, não bloqueia por engano.
        if (capacitor?.isNativePlatform() && !capacitor.isPluginAvailable("App")) {
          return LEGACY_NATIVE_VERSION;
        }
        return WEB_APP_VERSION;
      }
    };

    const check = async () => {
      let version = WEB_APP_VERSION;
      try {
        version = await resolveCurrentVersion();
      } catch {
        version = WEB_APP_VERSION;
      }
      if (!active) return;
      setCurrentVersion(version);

      const timeout = window.setTimeout(() => controller.abort(), 6000);
      try {
        const response = await fetch("/api/app-version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("version endpoint unavailable");

        const data = (await response.json()) as VersionPayload;
        if (!active) return;

        const minimum =
          typeof data.versao_minima === "string"
            ? data.versao_minima
            : "1.0.0";
        setMinimumVersion(minimum);

        if (safeHttpsUrl(data.link_loja)) setStoreUrl(data.link_loja);
        if (typeof data.mensagem === "string" && data.mensagem.trim()) {
          setMessage(data.mensagem.trim());
        }

        if (isVersionBelow(version, minimum)) {
          setState("outdated");
          return;
        }
      } catch {
        // Sem rede ou endpoint fora do ar: não bloqueia o app.
      } finally {
        window.clearTimeout(timeout);
      }

      if (!active) return;
      const remaining = Math.max(0, 600 - (Date.now() - startedAt));
      timer = window.setTimeout(() => {
        if (active) setState("ready");
      }, remaining);
    };

    void check();

    return () => {
      active = false;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (state !== "outdated") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    actionRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        actionRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [state]);

  const openStore = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (!native) return;
    // No WebView do Capacitor, `_blank` abre o navegador do sistema em vez de
    // navegar dentro do próprio app.
    event.preventDefault();
    window.open(storeUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      {children}

      {native && state === "checking" ? (
        <div
          className="fixed inset-0 z-[130] flex flex-col items-center justify-center gap-6 bg-[#0a0a0a] text-white"
          aria-live="polite"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="font-editorial text-[52px] leading-[0.78] tracking-[-0.055em]">
              velo<span className="text-accent">.</span>
            </span>
            <span className="eyebrow text-[8px] text-white/45">
              o mundo em movimento
            </span>
          </div>
          <span className="flex items-center gap-2 text-[10px] text-white/50">
            <span className="size-3 animate-spin rounded-full border border-white/25 border-t-white/80" />
            verificando atualização…
          </span>
        </div>
      ) : null}

      {state === "outdated" ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-paper/95 px-5 py-8 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="velo-update-title"
          aria-describedby="velo-update-description"
        >
          <div className="w-full max-w-[440px] rounded-[28px] border border-line bg-paper p-7 shadow-[0_30px_90px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <span className="font-editorial text-[30px] leading-[0.8] tracking-[-0.055em] text-ink">
                velo<span className="text-accent">.</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-dim px-2.5 py-1 text-[8px] font-semibold uppercase tracking-[0.14em] text-accent">
                <ShieldAlert className="size-3" strokeWidth={2} />
                atualização obrigatória
              </span>
            </div>

            <h2
              id="velo-update-title"
              className="mt-6 font-editorial text-[38px] leading-[0.92] tracking-[-0.04em] text-ink"
            >
              o velo mudou
              <br />
              de roupa.
            </h2>
            <p
              id="velo-update-description"
              className="mt-3 text-[13px] leading-relaxed text-muted"
            >
              {message} Esta versão do app ficou para trás e precisa ser
              atualizada para continuar navegando.
            </p>

            <div className="mt-5 flex items-center gap-2 text-[10px] text-muted">
              <span className="rounded-full border border-line bg-surface px-2.5 py-1 tabular-nums">
                instalada {currentVersion}
              </span>
              <span className="text-muted/50">·</span>
              <span className="rounded-full border border-line bg-surface px-2.5 py-1 tabular-nums">
                mínima {minimumVersion}
              </span>
            </div>

            <a
              ref={actionRef}
              href={storeUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={openStore}
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-[12px] font-semibold uppercase tracking-[0.12em] text-[#0a0a0a] transition hover:bg-ink hover:text-paper"
            >
              {storeUrl.toLowerCase().includes(".apk")
                ? "baixar atualização"
                : "abrir loja"}
              <ArrowUpRight className="size-4" strokeWidth={2} />
            </a>

            <p className="mt-3 text-center text-[10px] leading-relaxed text-muted/80">
              Depois de atualizar, é só abrir o velo de novo. Sua conta e seus
              momentos continuam aqui.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
