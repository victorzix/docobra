import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido.").transform((v) => v.trim().toLowerCase()),
  senha: z.string().min(1, "Informe sua senha."),
});

export type LoginInput = z.infer<typeof loginSchema>;
