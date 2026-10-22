import type { Client } from "pg";

export interface Janela {
  inicio: Date;
  fim: Date;
}

export function janelaAtual(ancora: Date, janelaDias: number, agora: Date): Janela;

export interface PermissaoMostrada {
  chave: string;
  origem: "sobrescrita" | "plano";
  valor: number | null;
  janelaDias: number | null;
  usado: number | null;
  janela: Janela | null;
}

export interface EmpresaMostrada {
  empresa: { id: string; nome: string };
  assinatura: { status: string; inicio: Date; venceEm: Date; plano: string };
  permissoes: PermissaoMostrada[];
}

export function mostrarEmpresa(client: Client, email: string, opcoes?: { agora?: Date }): Promise<EmpresaMostrada>;

export function trocarPlano(
  client: Client,
  email: string,
  planoChave: string,
  opcoes?: { agora?: Date },
): Promise<{ de: string; para: string; statusAnterior: string; statusNovo: string }>;

export interface OpcoesCota {
  permissao: string;
  valor: number | null;
  janelaDias: number | null;
  expiraEm?: Date | null;
  motivo?: string;
  agora?: Date;
}

export function definirCota(client: Client, email: string, opcoes: OpcoesCota): Promise<void>;

export function estenderVencimento(
  client: Client,
  email: string,
  dias: number,
  opcoes?: { agora?: Date },
): Promise<{ venceEm: Date }>;

export interface Argumentos {
  acao: string | undefined;
  email?: string;
  plano?: string;
  permissao?: string;
  valor?: number | null;
  janelaDias?: number;
  expiraEm?: Date;
  motivo?: string;
  dias?: number;
}

export function lerArgumentos(argv: string[]): Argumentos;
