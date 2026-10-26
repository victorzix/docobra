import { z } from "zod";

import { documentoSchema } from "@/lib/validations/empresa/documento.schema";

export const registerSchema = z.object({
  nomeEmpresa: z.string().min(1, "Informe o nome da empresa."),
  documento: documentoSchema,
  nome: z.string().min(1, "Informe seu nome."),
  email: z.string().email("Email inválido.").transform((v) => v.trim().toLowerCase()),
  senha: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
});

export type RegisterInput = z.infer<typeof registerSchema>;
