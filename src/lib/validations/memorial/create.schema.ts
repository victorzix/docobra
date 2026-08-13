import { z } from "zod";

const especificacoesSchema = z.object({
  fundacaoEstrutura: z.string().optional(),
  alvenariaCobertura: z.string().optional(),
  instalacoes: z.string().optional(),
  acabamentos: z.string().optional(),
});

const camposBase = {
  projetoId: z.string().min(1, "Selecione um projeto."),
  tipoConstrucao: z.string().min(1, "Informe o tipo de construção."),
  numeroPavimentos: z.number().int().positive().optional(),
  areaConstruida: z.number().positive().optional(),
  areaTerreno: z.number().positive().optional(),
};

export const criarMemorialSchema = z.discriminatedUnion("modoEspecificacoes", [
  z.object({
    ...camposBase,
    modoEspecificacoes: z.literal("texto"),
    especificacoes: especificacoesSchema.optional(),
  }),
  z.object({
    ...camposBase,
    modoEspecificacoes: z.literal("audio"),
    audioBase64: z.string().min(1, "Áudio ausente."),
    audioMimeType: z.string().min(1, "Tipo do áudio ausente."),
  }),
]);

export type CriarMemorialInput = z.infer<typeof criarMemorialSchema>;
