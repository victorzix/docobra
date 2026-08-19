import { z } from "zod";

export const memorialResponseSchema = z.object({
  id: z.string(),
  numero: z.number(),
  projetoNome: z.string(),
  status: z.string(),
  documentoGeradoUrl: z.string().nullable(),
  createdAt: z.string(),
});

export type MemorialResponse = z.infer<typeof memorialResponseSchema>;
