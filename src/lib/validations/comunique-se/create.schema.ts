import { z } from "zod";

const projetoIdSchema = z.string().uuid("Selecione um projeto.");

export const criarComuniqueSeSchema = z.discriminatedUnion("modoCriacao", [
  z.object({
    modoCriacao: z.literal("pdf"),
    projetoId: projetoIdSchema,
    pdfBase64: z.string().min(1, "Arquivo PDF ausente."),
  }),
  z.object({
    modoCriacao: z.literal("manual"),
    projetoId: projetoIdSchema,
    itens: z
      .array(z.object({ descricao: z.string().min(1, "Descreva a exigência.") }))
      .min(1, "Adicione pelo menos um item."),
  }),
]);

export type CriarComuniqueSeInput = z.infer<typeof criarComuniqueSeSchema>;
