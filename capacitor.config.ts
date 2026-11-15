import type { CapacitorConfig } from "@capacitor/cli";

/**
 * O velo é um app Next.js com autenticação e dados no Supabase. Em vez de
 * exportar uma versão estática (que quebraria rotas dinâmicas, cookies e RLS),
 * o app Android usa um WebView seguro apontando para a produção na Vercel.
 * A URL pode ser trocada por uma preview com CAPACITOR_SERVER_URL.
 */
const productionUrl =
  process.env.CAPACITOR_SERVER_URL?.trim() || "https://velo-iota-bice.vercel.app";

const config: CapacitorConfig = {
  appId: "app.velo.social",
  appName: "velo",
  webDir: "public",
  server: {
    url: productionUrl,
    cleartext: false,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: "#0A0A0A",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0A0A0A",
      overlaysWebView: false,
    },
  },
};

export default config;
