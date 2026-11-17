import type { ReactNode } from "react";
import { DirectProvider } from "@/components/providers/direct-provider";
import { AppShell } from "@/components/shell/app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DirectProvider>
      <AppShell>{children}</AppShell>
    </DirectProvider>
  );
}
