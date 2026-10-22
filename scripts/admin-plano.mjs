#!/usr/bin/env node
/**
 * Ajuste manual do plano de uma empresa pelo suporte. A empresa é identificada
 * pelo email de um usuário dela.
 *
 * Uso:
 *   node scripts/admin-plano.mjs mostrar --email=<usuario>
 *   node scripts/admin-plano.mjs trocar-plano --email=<usuario> --plano=<chave>
 *   node scripts/admin-plano.mjs cota --email=<usuario> --permissao=<chave> --valor=<n|ilimitado> --janela-dias=<n> [--expira-em=<data>] [--motivo=<texto>]
 *   node scripts/admin-plano.mjs estender --email=<usuario> --dias=<n>
 *
 * trocar-plano mantém o dia 0 e o consumo e não gera cobrança.
 * cota recomeça a janela da sobrescrita a partir de agora.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Mesma regra de src/lib/permissoes/janela.ts (calcularJanela); o teste garante que não divergem.
export function janelaAtual(ancora, janelaDias, agora) {
  const duracao = janelaDias * MS_POR_DIA;
  const decorrido = Math.max(0, agora.getTime() - ancora.getTime());
  const indice = Math.floor(decorrido / duracao);
  const inicio = new Date(ancora.getTime() + indice * duracao);
  return { inicio, fim: new Date(inicio.getTime() + duracao) };
}

async function buscarEmpresaPorEmail(client, email) {
  const { rows } = await client.query(
    `SELECT u.empresa_id AS "empresaId", e.nome AS "empresaNome"
     FROM usuario u JOIN empresa e ON e.id = u.empresa_id
     WHERE u.email = $1`,
    [email],
  );
  if (rows.length === 0) throw new Error(`Nenhum usuário com o email "${email}".`);
  return rows[0];
}

async function buscarAssinatura(client, empresaId) {
  const { rows } = await client.query(
    `SELECT a.id, a.inicio, a.status, a.vence_em AS "venceEm",
            t.id AS "trechoId", t.plano_id AS "planoId", p.chave AS "planoChave"
     FROM assinatura a
     JOIN assinatura_trecho t ON t.assinatura_id = a.id AND t.fim IS NULL
     JOIN plano p ON p.id = t.plano_id
     WHERE a.empresa_id = $1`,
    [empresaId],
  );
  if (rows.length === 0) throw new Error("A empresa não tem assinatura.");
  return rows[0];
}

export async function mostrarEmpresa(client, email, { agora = new Date() } = {}) {
  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows: doPlano } = await client.query(
    `SELECT pe.id AS "permissaoId", pe.chave, pp.valor, pp.janela_dias AS "janelaDias"
     FROM plano_permissao pp JOIN permissao pe ON pe.id = pp.permissao_id
     WHERE pp.plano_id = $1`,
    [assinatura.planoId],
  );
  const { rows: sobrescritas } = await client.query(
    `SELECT pe.id AS "permissaoId", pe.chave, ep.valor, ep.janela_dias AS "janelaDias", ep.inicio
     FROM empresa_permissao ep JOIN permissao pe ON pe.id = ep.permissao_id
     WHERE ep.empresa_id = $1 AND ep.inicio <= $2 AND (ep.expira_em IS NULL OR ep.expira_em > $2)`,
    [empresa.empresaId, agora],
  );

  const concessoes = new Map();
  for (const linha of doPlano) {
    concessoes.set(linha.chave, { ...linha, origem: "plano", ancora: assinatura.inicio });
  }
  for (const linha of sobrescritas) {
    concessoes.set(linha.chave, { ...linha, origem: "sobrescrita", ancora: linha.inicio });
  }

  const permissoes = [];
  for (const concessao of concessoes.values()) {
    let usado = null;
    let janela = null;
    if (concessao.valor !== null && concessao.janelaDias !== null) {
      janela = janelaAtual(concessao.ancora, concessao.janelaDias, agora);
      const { rows } = await client.query(
        `SELECT COALESCE(SUM(quantidade), 0)::int AS total FROM consumo
         WHERE empresa_id = $1 AND permissao_id = $2 AND ocorrido_em >= $3 AND ocorrido_em < $4`,
        [empresa.empresaId, concessao.permissaoId, janela.inicio, janela.fim],
      );
      usado = rows[0].total;
    }
    permissoes.push({
      chave: concessao.chave,
      origem: concessao.origem,
      valor: concessao.valor,
      janelaDias: concessao.janelaDias,
      usado,
      janela,
    });
  }
  permissoes.sort((a, b) => a.chave.localeCompare(b.chave));

  return {
    empresa: { id: empresa.empresaId, nome: empresa.empresaNome },
    assinatura: {
      status: assinatura.status,
      inicio: assinatura.inicio,
      venceEm: assinatura.venceEm,
      plano: assinatura.planoChave,
    },
    permissoes,
  };
}

export async function trocarPlano(client, email, planoChave, { agora = new Date() } = {}) {
  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows: planos } = await client.query("SELECT id, interno FROM plano WHERE chave = $1", [planoChave]);
  if (planos.length === 0) throw new Error(`Plano "${planoChave}" não encontrado.`);
  if (planos[0].id === assinatura.planoId) {
    throw new Error(`A empresa já está no plano "${planoChave}".`);
  }

  const statusNovo =
    assinatura.status === "trial" && !planos[0].interno ? "ativa" : assinatura.status;

  await client.query("BEGIN");
  try {
    await client.query("UPDATE assinatura_trecho SET fim = $1 WHERE id = $2", [agora, assinatura.trechoId]);
    await client.query(
      `INSERT INTO assinatura_trecho (assinatura_id, plano_id, inicio, origem)
       VALUES ($1, $2, $3, 'suporte')`,
      [assinatura.id, planos[0].id, agora],
    );
    if (statusNovo !== assinatura.status) {
      await client.query("UPDATE assinatura SET status = $1, updated_at = $2 WHERE id = $3", [
        statusNovo,
        agora,
        assinatura.id,
      ]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { de: assinatura.planoChave, para: planoChave, statusAnterior: assinatura.status, statusNovo };
}

export async function definirCota(
  client,
  email,
  { permissao, valor, janelaDias, expiraEm = null, motivo = "", agora = new Date() },
) {
  if ((valor === null) !== (janelaDias === null)) {
    throw new Error("valor e janela-dias devem vir juntos (ou ambos ilimitado).");
  }

  const empresa = await buscarEmpresaPorEmail(client, email);
  const { rows } = await client.query("SELECT id FROM permissao WHERE chave = $1", [permissao]);
  if (rows.length === 0) throw new Error(`Permissão "${permissao}" não encontrada.`);

  await client.query(
    `INSERT INTO empresa_permissao (empresa_id, permissao_id, valor, janela_dias, inicio, expira_em, motivo)
     VALUES ($1, $2, $3::int, $4::int, $5, $6, $7)
     ON CONFLICT (empresa_id, permissao_id) DO UPDATE SET
       valor = EXCLUDED.valor,
       janela_dias = EXCLUDED.janela_dias,
       inicio = EXCLUDED.inicio,
       expira_em = EXCLUDED.expira_em,
       motivo = EXCLUDED.motivo`,
    [empresa.empresaId, rows[0].id, valor, janelaDias, agora, expiraEm, motivo],
  );
}

export async function estenderVencimento(client, email, dias, { agora = new Date() } = {}) {
  if (!Number.isInteger(dias) || dias <= 0) {
    throw new Error("--dias deve ser um inteiro positivo.");
  }

  const empresa = await buscarEmpresaPorEmail(client, email);
  const assinatura = await buscarAssinatura(client, empresa.empresaId);

  const { rows } = await client.query(
    `UPDATE assinatura SET vence_em = vence_em + ($1::int * interval '1 day'), updated_at = $2
     WHERE id = $3
     RETURNING vence_em AS "venceEm"`,
    [dias, agora, assinatura.id],
  );
  return { venceEm: rows[0].venceEm };
}

export function lerArgumentos(argv) {
  const [acao, ...resto] = argv;
  const args = { acao };

  for (const arg of resto) {
    const match = arg.match(/^--([a-z-]+)=(.*)$/);
    if (!match) continue;
    const [, nome, valor] = match;

    if (nome === "email") args.email = valor;
    else if (nome === "plano") args.plano = valor;
    else if (nome === "permissao") args.permissao = valor;
    else if (nome === "valor") args.valor = valor === "ilimitado" ? null : Number(valor);
    else if (nome === "janela-dias") args.janelaDias = Number(valor);
    else if (nome === "expira-em") args.expiraEm = new Date(valor);
    else if (nome === "motivo") args.motivo = valor;
    else if (nome === "dias") args.dias = Number(valor);
  }

  return args;
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

function exigir(valor, flag) {
  if (valor === undefined) throw new Error(`Faltou ${flag}.`);
  return valor;
}

async function main() {
  const args = lerArgumentos(process.argv.slice(2));
  const env = { ...(await readEnvFile()), ...process.env };

  if (!env.DATABASE_URL) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  try {
    const email = exigir(args.email, "--email");

    if (args.acao === "mostrar") {
      console.log(JSON.stringify(await mostrarEmpresa(client, email), null, 2));
    } else if (args.acao === "trocar-plano") {
      const resultado = await trocarPlano(client, email, exigir(args.plano, "--plano"));
      console.log(JSON.stringify(resultado, null, 2));
      if (resultado.statusAnterior !== resultado.statusNovo) {
        console.log('O status passou de trial para ativa; ajuste o vencimento com a ação "estender" se precisar.');
      }
    } else if (args.acao === "cota") {
      await definirCota(client, email, {
        permissao: exigir(args.permissao, "--permissao"),
        valor: exigir(args.valor, "--valor"),
        janelaDias: args.valor === null ? null : exigir(args.janelaDias, "--janela-dias"),
        expiraEm: args.expiraEm ?? null,
        motivo: args.motivo ?? "",
      });
      console.log("Cota definida.");
    } else if (args.acao === "estender") {
      console.log(JSON.stringify(await estenderVencimento(client, email, exigir(args.dias, "--dias")), null, 2));
    } else {
      throw new Error('Ação desconhecida. Use: mostrar, trocar-plano, cota ou estender.');
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
