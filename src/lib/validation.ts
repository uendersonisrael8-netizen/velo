import { z } from "zod";
import { VELO_IA_IMAGE_MAX_DATA_URL_LENGTH } from "@/lib/ai/constants";
import { normalizeEmail, sanitizeText } from "@/lib/sanitize";
import { normalizeHandle, normalizeTag } from "@/lib/utils";

const handleSchema = z
  .string()
  .transform((value) => normalizeHandle(value))
  .pipe(
    z
      .string()
      .min(3, "Use pelo menos 3 caracteres.")
      .max(24, "Use no máximo 24 caracteres.")
      .regex(/^[a-z0-9_]+$/, "Use apenas letras, números e _."),
  );

const emailSchema = z
  .string()
  .transform((value) => normalizeEmail(value))
  .pipe(
    z
      .string()
      .min(1, "Informe seu e-mail.")
      .email("Informe um e-mail válido.")
      .max(254, "E-mail muito longo."),
  );

function textSchema(
  min: number,
  max: number,
  messages: { min: string; max: string },
  multiline = false,
) {
  return z
    .string()
    .transform((value) => sanitizeText(value, { multiline }))
    .pipe(z.string().min(min, messages.min).max(max, messages.max));
}

/**
 * Login não aplica a política de criação de senha. Contas antigas ou criadas
 * em outro cliente podem ter senhas menores que 8 caracteres; validar o
 * tamanho aqui produzia um falso "senha incorreta" antes de falar com o
 * Supabase. A senha também não sofre trim: espaços podem ser significativos.
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, "Informe sua senha.")
    .max(128, "A senha é muito longa."),
});

export type LoginValues = z.infer<typeof loginSchema>;

export const signUpSchema = z
  .object({
    displayName: textSchema(2, 60, {
      min: "Informe seu nome.",
      max: "Use no máximo 60 caracteres.",
    }),
    handle: handleSchema,
    email: emailSchema,
    password: z
      .string()
      .min(8, "A senha precisa ter pelo menos 8 caracteres.")
      .max(128)
      .regex(/[a-zA-Z]/, "Inclua pelo menos uma letra.")
      .regex(/[0-9]/, "Inclua pelo menos um número."),
    confirmPassword: z.string().min(1, "Confirme sua senha."),
    terms: z
      .boolean()
      .refine((value) => value, "Você precisa aceitar os termos para continuar."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "As senhas não coincidem.",
  });

export type SignUpValues = z.infer<typeof signUpSchema>;

export const commentSchema = z.object({
  body: textSchema(
    1,
    500,
    {
      min: "Escreva algo para comentar.",
      max: "Comentários podem ter até 500 caracteres.",
    },
    true,
  ),
});

const aiHistoryEntrySchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z
    .string()
    .transform((value) => sanitizeText(value, { multiline: true }))
    .pipe(z.string().min(1).max(2000)),
});

export const aiChatSchema = z.object({
  message: textSchema(
    1,
    2000,
    {
      min: "Escreva uma mensagem.",
      max: "Mensagens podem ter até 2000 caracteres.",
    },
    true,
  ),
  // O backend Groq não tem banco: o cliente manda as últimas mensagens para
  // dar contexto. O servidor sanitiza de novo e limita a 10 no adaptador.
  history: z.array(aiHistoryEntrySchema).max(10).optional().catch(undefined),
  // Quando a pessoa está logada, o servidor carrega o contexto do Supabase e
  // ignora o history enviado pelo cliente.
  conversationId: z.string().uuid("Conversa inválida.").optional(),
  // Imagem opcional em data URL. O adaptador confere os bytes e a assinatura
  // real do arquivo antes de mandar para a Groq.
  image: z
    .string()
    .max(VELO_IA_IMAGE_MAX_DATA_URL_LENGTH, "A imagem é muito grande.")
    .regex(
      /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/,
      "Envie uma imagem JPG, PNG ou WebP.",
    )
    .optional(),
});

export const aiRewriteSchema = z.object({
  text: textSchema(
    1,
    2000,
    {
      min: "Escreva uma frase para corrigir.",
      max: "Textos podem ter até 2000 caracteres.",
    },
    true,
  ),
});

// Modo de voz: o navegador grava o áudio (WebM/Ogg/MP4) e manda em base64.
// O limite de tamanho é conferido de novo no servidor, depois do decode.
export const aiTranscribeSchema = z.object({
  audio: z
    .string()
    .min(1, "Grave um áudio antes de enviar.")
    .max(6_000_000, "O áudio é muito longo."),
  mimeType: z
    .string()
    .max(64, "Tipo de áudio inválido.")
    .optional(),
});

export type AiChatValues = z.infer<typeof aiChatSchema>;

export const uploadSchema = z.object({
  caption: textSchema(
    0,
    2200,
    {
      min: "",
      max: "A legenda pode ter até 2200 caracteres.",
    },
    true,
  ),
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(8, "Use no máximo 8 tags.")
    .transform((tags) => [...new Set(tags.map(normalizeTag).filter(Boolean))]),
  location: z
    .string()
    .transform((value) => sanitizeText(value, { maxLength: 80 }))
    .pipe(z.string().max(80, "Use até 80 caracteres."))
    .optional(),
  audio: z
    .string()
    .transform((value) => sanitizeText(value, { maxLength: 120 }))
    .pipe(z.string().max(120, "Use até 120 caracteres."))
    .optional(),
});

export const profileSchema = z.object({
  displayName: textSchema(2, 60, {
    min: "Informe seu nome.",
    max: "Use no máximo 60 caracteres.",
  }),
  handle: handleSchema,
  bio: textSchema(
    0,
    160,
    {
      min: "",
      max: "A bio pode ter até 160 caracteres.",
    },
    true,
  ),
  link: z
    .string()
    .transform((value) => sanitizeText(value, { maxLength: 120 }))
    .pipe(z.string().max(120, "Link muito longo."))
    .optional()
    .refine(
      (value) => !value || /^([a-z0-9-]+\.)+[a-z]{2,}([/?#].*)?$/i.test(value),
      "Informe um link válido, como seu-site.com.",
    ),
  location: z
    .string()
    .transform((value) => sanitizeText(value, { maxLength: 60 }))
    .pipe(z.string().max(60, "Use até 60 caracteres."))
    .optional(),
});

export type ProfileValues = z.infer<typeof profileSchema>;

export function flattenZodErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}

export function getErrorMessage(error: unknown, fallback = "Algo deu errado. Tente de novo.") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}
