#!/usr/bin/env node
/**
 * Semeia o catálogo de permissões e os planos, e dá uma assinatura às empresas
 * que ainda não têm (as que existiam antes dos planos). Idempotente.
 *
 * Os valores abaixo (preços, limites, trial) são PROVISÓRIOS.
 *
 * Planos e vínculos só são inseridos (ON CONFLICT DO NOTHING): rodar o seed de
 * novo não desfaz um preço ou limite que foi ajustado no banco depois.
 * Permissões são atualizadas (descrição/tipo), pois são catálogo de código.
 *
 * Uso:
 *   node scripts/seed-planos.mjs
 *   node scripts/seed-planos.mjs --plano=essencial   # plano das empresas existentes
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const VALIDADE_EMPRESAS_EXISTENTES_DIAS = 360;

const PERMISSOES = [
  { chave: "memorial.gerar", tipo: "limite", descricao: "Memoriais descritivos gerados" },
  { chave: "comunique-se.processar", tipo: "limite", descricao: "Comunique-se processados por IA" },
  { chave: "projetos.criar", tipo: "limite", descricao: "Projetos criados" },
  { chave: "memorial.audio", tipo: "booleana", descricao: "Entrada do memorial por áudio" },
  { chave: "acervo.listar", tipo: "booleana", descricao: "Ver a lista de projetos e documentos" },
  { chave: "acervo.abrir", tipo: "booleana", descricao: "Abrir projetos e documentos" },
  { chave: "acervo.baixar", tipo: "booleana", descricao: "Baixar PDFs e modelos" },
];

const limite = (chave, valor, janelaDias) => ({ chave, valor, janelaDias });
const liberada = (chave) => ({ chave, valor: null, janelaDias: null });

const ACERVO = [liberada("acervo.listar"), liberada("acervo.abrir"), liberada("acervo.baixar")];

const PLANOS = [
  {
    chave: "trial",
    nome: "Trial",
    nivel: 0,
    cicloDias: 14,
    precoCentavos: 0,
    interno: true,
    permissoes: [
      limite("memorial.gerar", 3, 14),
      limite("comunique-se.processar", 3, 14),
      limite("projetos.criar", 2, 14),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
  {
    chave: "suspenso",
    nome: "Leitura limitada",
    nivel: 0,
    cicloDias: 30,
    precoCentavos: 0,
    interno: true,
    permissoes: [liberada("acervo.listar")],
  },
  {
    chave: "essencial",
    nome: "Essencial",
    nivel: 1,
    cicloDias: 30,
    precoCentavos: 9900,
    interno: false,
    permissoes: [
      limite("memorial.gerar", 20, 30),
      limite("comunique-se.processar", 20, 30),
      limite("projetos.criar", 10, 30),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
  {
    chave: "escritorio",
    nome: "Escritório",
    nivel: 2,
    cicloDias: 30,
    precoCentavos: 24900,
    interno: false,
    permissoes: [
      limite("memorial.gerar", 90, 30),
      limite("comunique-se.processar", 90, 30),
      liberada("projetos.criar"),
      liberada("memorial.audio"),
      ...ACERVO,
    ],
  },
];

export async function semearPlanos(client) {
  for (const p of PERMISSOES) {
    await client.query(
      `INSERT INTO permissao (chave, tipo, descricao) VALUES ($1, $2, $3)
       ON CONFLICT (chave) DO UPDATE SET tipo = EXCLUDED.tipo, descricao = EXCLUDED.descricao`,
      [p.chave, p.tipo, p.descricao],
    );
  }

  for (const pl of PLANOS) {
    await client.query(
      `INSERT INTO plano (chave, nome, nivel, ciclo_dias, preco_centavos, interno)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (chave) DO NOTHING`,
      [pl.chave, pl.nome, pl.nivel, pl.cicloDias, pl.precoCentavos, pl.interno],
    );

    for (const v of pl.permissoes) {
      await client.query(
        `INSERT INTO plano_permissao (plano_id, permissao_id, valor, janela_dias)
         SELECT p.id, pe.id, $3::int, $4::int
         FROM plano p, permissao pe
         WHERE p.chave = $1 AND pe.chave = $2
         ON CONFLICT DO NOTHING`,
        [pl.chave, v.chave, v.valor, v.janelaDias],
      );
    }
  }
}

export async function preencherAssinaturasExistentes(
  client,
  { planoChave = "escritorio", agora = new Date() } = {},
) {
  const { rows: planos } = await client.query("SELECT id FROM plano WHERE chave = $1", [planoChave]);
  if (planos.length === 0) {
    throw new Error(`Plano "${planoChave}" não encontrado. Rode semearPlanos antes.`);
  }

  const { rows: empresas } = await client.query(
    `SELECT e.id FROM empresa e
     LEFT JOIN assinatura a ON a.empresa_id = e.id
     WHERE a.id IS NULL`,
  );

  const venceEm = new Date(agora.getTime() + VALIDADE_EMPRESAS_EXISTENTES_DIAS * MS_POR_DIA);

  for (const empresa of empresas) {
    await client.query("BEGIN");
    try {
      const { rows } = await client.query(
        `INSERT INTO assinatura (empresa_id, inicio, status, vence_em)
         VALUES ($1, $2, 'ativa', $3) RETURNING id`,
        [empresa.id, agora, venceEm],
      );
      await client.query(
        `INSERT INTO assinatura_trecho (assinatura_id, plano_id, inicio, origem)
         VALUES ($1, $2, $3, 'suporte')`,
        [rows[0].id, planos[0].id, agora],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  return empresas.length;
}

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function readEnvFile() {
  const file = path.join(process.cwd(), ".env");
  if (!existsSync(file)) return {};

  const out = {};
  for (const line of (await readFile(file, "utf8")).split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const env = { ...(await readEnvFile()), ...process.env };

  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    await semearPlanos(client);
    console.log(`Catálogo: ${PERMISSOES.length} permissões, ${PLANOS.length} planos (idempotente).`);

    const total = await preencherAssinaturasExistentes(client, {
      planoChave: args.plano ?? "escritorio",
    });
    console.log(`Empresas que ganharam assinatura: ${total}.`);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
