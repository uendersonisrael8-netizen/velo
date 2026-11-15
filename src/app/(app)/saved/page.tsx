import type { Metadata } from "next";
import { SavedView } from "@/components/saved/saved-view";

export const metadata: Metadata = {
  title: "Guardados",
  description: "Sua coleção particular de fotos e vídeos do velo.",
  robots: { index: false, follow: false },
};

export default function SavedPage() {
  return <SavedView />;
}
