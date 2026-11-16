/**
 * Comparação de versões sem dependência externa.
 *
 * Aceita `1`, `1.2`, `1.2.3` e sufixos de pré-lançamento (`1.2.3-beta.1`).
 * Versões inválidas nunca bloqueiam o app: é melhor deixar a pessoa entrar do
 * que travar tudo por causa de uma variável de ambiente mal formatada.
 */

const VERSION_RE = /^(\d{1,4})(?:\.(\d{1,4}))?(?:\.(\d{1,4}))?(?:[-+][0-9A-Za-z.-]+)?$/;

export function normalizeVersion(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const match = VERSION_RE.exec(trimmed);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2] ?? "0");
  const patch = Number(match[3] ?? "0");

  return `${major}.${minor}.${patch}`;
}

export function compareVersions(left: string, right: string): number {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  if (!a || !b) return 0;

  const [aMajor, aMinor, aPatch] = a.split(".").map(Number);
  const [bMajor, bMinor, bPatch] = b.split(".").map(Number);

  if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
  if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
  if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
  return 0;
}

export function isVersionBelow(current: string, minimum: string): boolean {
  return compareVersions(current, minimum) < 0;
}

/**
 * Versão exibida no navegador/PWA. No app Android, o `VersionGate` usa a
 * versão nativa via `@capacitor/app`; este valor é o fallback web.
 */
export const WEB_APP_VERSION =
  normalizeVersion(process.env.NEXT_PUBLIC_APP_VERSION) ?? "1.0.0";
