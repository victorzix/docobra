const PESOS_CPF = [
  [10, 9, 8, 7, 6, 5, 4, 3, 2],
  [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
];
const PESOS_CNPJ = [
  [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
];

// Mesma regra do módulo 11 para CPF e CNPJ: resto < 2 vira 0, senão 11 - resto.
function digitoVerificador(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, n, i) => acc + n * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarDocumento(valor: string): boolean {
  const limpo = valor.replace(/\D/g, "");
  if (limpo.length !== 11 && limpo.length !== 14) return false;

  const digitos = limpo.split("").map(Number);
  if (digitos.every((d) => d === digitos[0])) return false;

  const [pesos1, pesos2] = limpo.length === 11 ? PESOS_CPF : PESOS_CNPJ;
  const base = digitos.length - 2;
  return (
    digitoVerificador(digitos.slice(0, base), pesos1) === digitos[base] &&
    digitoVerificador(digitos.slice(0, base + 1), pesos2) === digitos[base + 1]
  );
}

function aplicarPadrao(digitos: string, padrao: string): string {
  let proximo = 0;
  let saida = "";
  for (const caractere of padrao) {
    if (proximo >= digitos.length) break;
    saida += caractere === "0" ? digitos[proximo++] : caractere;
  }
  return saida;
}

export function mascararDocumento(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return aplicarPadrao(digitos, digitos.length <= 11 ? "000.000.000-00" : "00.000.000/0000-00");
}
