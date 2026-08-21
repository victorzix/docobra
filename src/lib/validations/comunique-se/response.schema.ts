import { z } from "zod";

export const comuniqueSeResponseSchema = z.object({
  id: z.string(),
  numero: z.number(),
  projetoNome: z.string(),
  status: z.string(),
  pdfOriginalUrl: z.string().nullable(),
  createdAt: z.string(),
});

export type ComuniqueSeResponse = z.infer<typeof comuniqueSeResponseSchema>;
