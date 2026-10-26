import { PERMISSOES_DE_USO, type PermissaoDeUso } from "@/lib/permissoes/permissoes-de-uso";

export interface LinhaDeLimite {
  chave: string;
  valor: number | null;
  janelaDias: number | null;
}

const periodo = (dias: number) => (dias === 30 ? "por mês" : dias === 360 ? "por ano" : `a cada ${dias} dias`);

const contagem =
  (plural: string, ilimitado: string) =>
  ({ valor, janelaDias }: LinhaDeLimite) =>
    valor === null || janelaDias === null ? ilimitado : `${valor} ${plural} ${periodo(janelaDias)}`;

const TEXTO_DA_PERMISSAO: Record<PermissaoDeUso, (linha: LinhaDeLimite) => string> = {
  "memorial.gerar": contagem("memoriais", "Memoriais ilimitados"),
  "comunique-se.processar": contagem("análises de Comunique-se", "Comunique-se ilimitado"),
  "projetos.criar": contagem("projetos", "Projetos ilimitados"),
  "memorial.audio": () => "Memorial por áudio",
};

export function descreverLimitesDoPlano(linhas: LinhaDeLimite[]): string[] {
  return PERMISSOES_DE_USO.flatMap((chave) => {
    const linha = linhas.find((l) => l.chave === chave);
    return linha ? [TEXTO_DA_PERMISSAO[chave](linha)] : [];
  });
}
