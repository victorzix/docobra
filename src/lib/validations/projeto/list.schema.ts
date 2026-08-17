import { z } from "zod";

export const listarProjetosQuerySchema = z.object({
  cursor: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
});

export type ListarProjetosQuery = z.infer<typeof listarProjetosQuerySchema>;
