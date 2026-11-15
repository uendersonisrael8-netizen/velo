function normalizeSiteUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

/**
 * URL pública usada em canonical, Open Graph, robots e sitemap.
 *
 * Ordem de precedência:
 * 1. NEXT_PUBLIC_SITE_URL (útil para domínio próprio);
 * 2. VERCEL_PROJECT_PRODUCTION_URL (preenchida pela Vercel em produção);
 * 3. localhost, para desenvolvimento.
 */
export const SITE_URL = normalizeSiteUrl(
  configuredSiteUrl || vercelProductionUrl || "http://localhost:3000",
);

/**
 * Download direto do APK Android.
 *
 * A Release `apk-latest` é recriada pelo workflow `.github/workflows/build-apk.yml`
 * a cada build, então esta URL permanece estável. Use
 * `NEXT_PUBLIC_ANDROID_APK_URL` para apontar para outro build (por exemplo,
 * uma release assinada de produção).
 */
const configuredApkUrl = process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim();

export const ANDROID_APK_URL =
  configuredApkUrl && /^https:\/\//i.test(configuredApkUrl)
    ? configuredApkUrl
    : "https://github.com/uendersonisrael8-netizen/velo/releases/latest/download/velo.apk";

export const SITE_NAME = "velo.";
export const SITE_TITLE = "velo. — rede social de vídeos curtos e fotografia";
export const SITE_DESCRIPTION =
  "Rede social aberta de vídeos curtos e fotografia. Descubra pessoas, lugares e momentos no velo — o mundo em movimento, no seu ritmo.";

export const SITE_KEYWORDS = [
  "velo",
  "velo rede social",
  "rede social de vídeos curtos",
  "vídeos curtos",
  "vídeos verticais",
  "fotografia",
  "compartilhar fotos",
  "compartilhar vídeos",
  "feed vertical",
  "stories",
  "momentos",
  "rede social aberta",
];

export const OG_IMAGE = {
  url: "/og-velo.png",
  width: 1200,
  height: 630,
  alt: "velo. — o mundo em movimento",
};
