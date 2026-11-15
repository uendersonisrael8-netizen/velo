import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Criar conta",
  description: "Crie sua conta no velo e comece a publicar.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return <SignupForm />;
}
