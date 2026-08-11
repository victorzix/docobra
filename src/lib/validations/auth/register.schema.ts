import { z } from "zod";

export const registerSchema = z.object({
  nomeEmpresa: z.string().min(1, "Informe o nome da empresa."),
  nome: z.string().min(1, "Informe seu nome."),
  email: z.string().email("Email inválido.").transform((v) => v.trim().toLowerCase()),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
