import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Entrar",
  description: "Entre na sua conta do velo.",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const authFailed = error === "auth" || error === "oauth";

  return (
    <LoginForm
      oauthError={
        authFailed ? "Não foi possível concluir o login. Tente de novo." : null
      }
    />
  );
}
