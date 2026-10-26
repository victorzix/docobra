import { MS_POR_DIA } from "@/lib/permissoes/janela";

export const diasRestantesAte = (venceEm: Date, agora: Date): number =>
  Math.max(0, Math.ceil((venceEm.getTime() - agora.getTime()) / MS_POR_DIA));
