"use client";

import { useSyncExternalStore } from "react";

/** Mesmo ponto de corte usado pelo shell e pelo feed (md no Tailwind). */
export const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  // No servidor não existe viewport; o primeiro paint usa o layout desktop e o
  // cliente corrige os comportamentos assim que hidrata.
  return false;
}

/**
 * Detecta telas menores que 768px e reage a rotações e redimensionamentos.
 * Use para comportamento (teclado x toque, preload de vídeo), não para
 * esconder conteúdo — isso fica com as classes responsivas do Tailwind.
 */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
