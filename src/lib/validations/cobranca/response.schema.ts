import { z } from "zod";

export const cobrancaResponseSchema = z.object({
  id: z.string(),
  tipo: z.enum(["assinatura", "upgrade", "renovacao"]),
  status: z.enum(["pendente", "paga", "vencida", "cancelada", "estornada"]),
  valorCentavos: z.number().int(),
  venceEm: z.string(),
  pix: z
    .object({
      copiaECola: z.string(),
      qrCodeBase64: z.string(),
      expiraEm: z.string().nullable(),
    })
    .nullable(),
});

export type CobrancaResponse = z.infer<typeof cobrancaResponseSchema>;
