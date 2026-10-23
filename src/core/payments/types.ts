export interface DadosCliente {
  nome: string;
  documento: string;
  email: string | null;
}

export interface CriarCobrancaInput {
  clienteId: string;
  referencia: string;
  valorCentavos: number;
  venceEm: Date;
  descricao: string;
}

export interface CobrancaCriada {
  providerChargeId: string;
  pix: { copiaECola: string; qrCodeBase64: string; expiraEm: Date | null };
}

export type StatusEvento = "paga" | "vencida" | "cancelada" | "estornada";

export interface EventoPagamento {
  eventId: string;
  tipoOriginal: string;
  status: StatusEvento;
  providerChargeId: string;
  referencia: string | null;
  payload: unknown;
}

export interface PaymentProvider {
  readonly nome: string;
  criarCliente(dados: DadosCliente, referencia: string): Promise<string>;
  criarCobranca(input: CriarCobrancaInput): Promise<CobrancaCriada>;
  buscarCobrancaPorReferencia(referencia: string): Promise<CobrancaCriada | null>;
  cancelarCobranca(providerChargeId: string): Promise<void>;
  lerWebhook(headers: Headers, corpoCru: string): EventoPagamento | null;
}
