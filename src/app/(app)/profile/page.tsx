import type { Metadata } from "next";
import { ProfileView } from "@/components/profile/profile-view";

export const metadata: Metadata = {
  title: "Seu perfil",
  description: "Seu perfil, suas publicações e seus guardados no velo.",
  robots: { index: false, follow: false },
};

export default function ProfilePage() {
  return <ProfileView />;
}
