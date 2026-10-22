export const MS_POR_DIA = 24 * 60 * 60 * 1000;

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function calcularJanela(ancora: Date, janelaDias: number, agora: Date): Janela {
  const duracao = janelaDias * MS_POR_DIA;
  const decorrido = Math.max(0, agora.getTime() - ancora.getTime());
  const indice = Math.floor(decorrido / duracao);
  const inicio = new Date(ancora.getTime() + indice * duracao);

  return { inicio, fim: new Date(inicio.getTime() + duracao) };
}
