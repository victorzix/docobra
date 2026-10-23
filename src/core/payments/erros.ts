// O gateway respondeu e recusou (4xx): é seguro tentar outro provider.
export class RecusaDefinitivaError extends Error {
  constructor(
    mensagem: string,
    public readonly codigo?: string,
    public readonly status?: number,
  ) {
    super(mensagem);
    this.name = "RecusaDefinitivaError";
  }
}

// Rede, timeout, 5xx, 408 ou 429: a operação pode ter sido feita. Não trocar de provider.
export class FalhaIncertaError extends Error {
  provider?: string;

  constructor(
    mensagem: string,
    public readonly causa?: unknown,
  ) {
    super(mensagem);
    this.name = "FalhaIncertaError";
  }
}

export class WebhookNaoAutenticadoError extends Error {
  constructor() {
    super("Token do webhook inválido.");
    this.name = "WebhookNaoAutenticadoError";
  }
}

export class WebhookInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "WebhookInvalidoError";
  }
}
