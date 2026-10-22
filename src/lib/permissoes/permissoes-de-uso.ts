export const PERMISSOES_DE_USO = [
  "memorial.gerar",
  "comunique-se.processar",
  "projetos.criar",
  "memorial.audio",
] as const;

export type PermissaoDeUso = (typeof PERMISSOES_DE_USO)[number];

export const ROTULOS_DE_USO: Record<PermissaoDeUso, string> = {
  "memorial.gerar": "gerar memoriais",
  "comunique-se.processar": "processar Comunique-se",
  "projetos.criar": "criar projetos",
  "memorial.audio": "usar o memorial por áudio",
};
