import type { Client } from "pg";

export function semearPlanos(client: Client): Promise<void>;

export function preencherAssinaturasExistentes(
  client: Client,
  opcoes?: { planoChave?: string; agora?: Date },
): Promise<number>;
