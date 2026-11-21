import type { Metadata } from "next";
import { VoiceCallView } from "@/components/ai/voice-call-view";

export const metadata: Metadata = {
  title: "velo ia — voz ao vivo",
  description:
    "Converse ao vivo com a velo ia por voz, como uma chamada telefônica. Fale naturalmente e ela responde falando em português do Brasil.",
  robots: { index: false, follow: false },
};

export default function VoiceCallPage() {
  return <VoiceCallView />;
}
