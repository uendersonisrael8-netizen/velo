import type { Metadata } from "next";
import { DirectView } from "@/components/direct/direct-view";

export const metadata: Metadata = {
  title: "Direct",
  description: "Suas conversas privadas e os vídeos compartilhados no velo.",
  robots: { index: false, follow: false },
};

export default function DirectPage() {
  return <DirectView />;
}
