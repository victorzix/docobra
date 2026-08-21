import { z } from "zod";

export const FORMATO_MODELO_EXPORTADO = "docobra-comunique-se-v1";
export const NOME_ARQUIVO_MODELO_EXPORTADO = "docobra-checklist.json";

export const modeloExportadoSchema = z.object({
  formato: z.literal(FORMATO_MODELO_EXPORTADO),
  itens: z.array(z.object({ descricao: z.string(), concluida: z.boolean() })),
});

export type ModeloExportado = z.infer<typeof modeloExportadoSchema>;
