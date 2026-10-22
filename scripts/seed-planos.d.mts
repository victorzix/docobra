import type { Client } from "pg";

export function semearPlanos(client: Client): Promise<void>;

export function criarAssinaturaInicial(
  client: Client,
  opcoes: { empresaId: string; planoChave?: string; agora?: Date },
): Promise<boolean>;

export function preencherAssinaturasExistentes(
  client: Client,
  opcoes?: { planoChave?: string; agora?: Date },
): Promise<number>;

export function lerOpcoes(argv: string[]): { planoChave: string; preencherExistentes: boolean };
