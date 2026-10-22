import type { Client } from "pg";

export function criarUsuarioComEmpresa(
  client: Client,
  dados: { nome: string; email: string; senha: string; nomeEmpresa: string },
): Promise<{ empresaId: string; usuarioId: string }>;
