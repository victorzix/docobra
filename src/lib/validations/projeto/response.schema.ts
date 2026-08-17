import { z } from "zod";

export const projetoResponseSchema = z.object({
  id: z.string(),
  numero: z.number(),
  nome: z.string(),
  endereco: z.string().nullable(),
  createdAt: z.string(),
});

export type ProjetoResponse = z.infer<typeof projetoResponseSchema>;
