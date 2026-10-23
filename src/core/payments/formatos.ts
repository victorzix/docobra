export function centavosParaReais(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

export function dataIso(data: Date): string {
  return data.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}
