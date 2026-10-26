const FUSO = "America/Sao_Paulo";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", year: "numeric" });

export function formatarReais(centavos: number): string {
  return moeda.format(centavos / 100);
}

// Fuso fixo: o mesmo texto no servidor e no navegador evita erro de hidratação.
export function formatarData(iso: string): string {
  return dataCurta.format(new Date(iso));
}

export function rotuloDaPeriodicidade(cicloDias: number): string {
  if (cicloDias === 30) return "mensal";
  if (cicloDias === 360) return "anual";
  return `${cicloDias} dias`;
}

export function rotuloDoCiclo(cicloDias: number): string {
  if (cicloDias === 30) return "mês";
  if (cicloDias === 360) return "ano";
  return `${cicloDias} dias`;
}
