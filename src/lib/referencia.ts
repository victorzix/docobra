export function formatarReferencia(prefixo: string, numero: number): string {
  return `${prefixo}-${String(numero).padStart(4, "0")}`;
}

export function referenciaProjeto(numero: number): string {
  return formatarReferencia("PRJ", numero);
}

export function referenciaMemorial(numero: number): string {
  return formatarReferencia("MD", numero);
}

export function referenciaComuniqueSe(numero: number): string {
  return formatarReferencia("CS", numero);
}
