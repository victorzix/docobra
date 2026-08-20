import { z } from "zod";

export const alternarItemChecklistSchema = z.object({
  itemId: z.string().min(1, "itemId ausente."),
  concluida: z.boolean(),
});

export type AlternarItemChecklistInput = z.infer<typeof alternarItemChecklistSchema>;
