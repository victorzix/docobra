import { z } from "zod";

export const criarProjetoSchema = z.object({
  nome: z.string().min(1, "Informe o nome do projeto."),
  endereco: z.string().optional(),
});

export type CriarProjetoInput = z.infer<typeof criarProjetoSchema>;
