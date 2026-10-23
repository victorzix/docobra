import { z } from "zod";

export const criarCobrancaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("assinatura"), planoChave: z.string().min(1, "Escolha um plano.") }),
  z.object({ tipo: z.literal("upgrade"), planoChave: z.string().min(1, "Escolha um plano.") }),
  z.object({ tipo: z.literal("renovacao") }),
]);

export type CriarCobrancaInput = z.infer<typeof criarCobrancaSchema>;
