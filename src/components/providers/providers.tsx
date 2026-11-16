"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/components/providers/app-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { VersionGate } from "@/components/system/version-gate";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <VersionGate>
          <AppProvider>{children}</AppProvider>
        </VersionGate>
      </ToastProvider>
    </ThemeProvider>
  );
}
