import { z } from "zod";

import { validarDocumento } from "@/lib/pagamentos/documento";

export const documentoSchema = z
  .string()
  .transform((valor) => valor.replace(/\D/g, ""))
  .pipe(z.string().refine(validarDocumento, "Informe um CPF ou CNPJ válido."));

export const atualizarDocumentoSchema = z.object({ documento: documentoSchema });

export type AtualizarDocumentoInput = z.infer<typeof atualizarDocumentoSchema>;
