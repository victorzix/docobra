import { z } from "zod";

export const adicionarItemChecklistSchema = z.object({
  descricao: z.string().min(1, "Descreva a exigência."),
});

export type AdicionarItemChecklistInput = z.infer<typeof adicionarItemChecklistSchema>;
