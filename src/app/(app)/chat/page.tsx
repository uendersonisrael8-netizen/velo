import type { Metadata } from "next";
import { ChatView } from "@/components/ai/chat-view";

export const metadata: Metadata = {
  title: "velo ia",
  description:
    "Converse com a velo ia, a amiga virtual do velo: um espaço privado para desabafar, pedir ideias e jogar conversa fora.",
  robots: { index: false, follow: false },
};

export default function ChatPage() {
  return <ChatView />;
}
