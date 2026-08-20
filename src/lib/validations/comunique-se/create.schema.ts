import { z } from "zod";

export const criarComuniqueSeSchema = z.object({
  projetoId: z.string().uuid("Selecione um projeto."),
  pdfBase64: z.string().min(1, "Arquivo PDF ausente."),
});

export type CriarComuniqueSeInput = z.infer<typeof criarComuniqueSeSchema>;
