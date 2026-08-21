import { z } from "zod";

export const alternarItemChecklistSchema = z
  .object({
    itemId: z.string().min(1, "itemId ausente."),
    concluida: z.boolean().optional(),
    descricao: z.string().min(1, "Descrição não pode ficar vazia.").optional(),
  })
  .refine((data) => data.concluida !== undefined || data.descricao !== undefined, {
    message: "Informe concluida ou descricao.",
  });

export type AlternarItemChecklistInput = z.infer<typeof alternarItemChecklistSchema>;
