import { z } from "zod";

export const atualizarDocumentoSchema = z.object({
  documento: z
    .string()
    .transform((valor) => valor.replace(/\D/g, ""))
    .pipe(z.string().regex(/^(\d{11}|\d{14})$/, "Informe um CPF (11 dígitos) ou um CNPJ (14 dígitos).")),
});

export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
