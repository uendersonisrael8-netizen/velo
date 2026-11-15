import type { Metadata } from "next";
import { UploadView } from "@/components/upload/upload-view";

export const metadata: Metadata = {
  title: "Publicar",
  description: "Publique uma foto ou um vídeo curto no velo.",
  robots: { index: false, follow: false },
};

export default function UploadPage() {
  return <UploadView />;
}
