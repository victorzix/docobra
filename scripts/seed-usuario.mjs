#!/usr/bin/env node
/**
 * Cria uma empresa + usuário base para login manual em dev, sem passar pela
 * tela de registro. Idempotente: se o email já existir, só informa e sai —
 * não duplica nem sobrescreve.
 *
 * Uso:
 *   node scripts/seed-usuario.mjs
 *   node scripts/seed-usuario.mjs --email=dev@docobra.com --senha=123456 --empresa="Minha Empresa" --nome="Dev"
 *
 * Roda tanto no container do app (tem node + as deps já instaladas) quanto
 * em qualquer lugar com DATABASE_URL apontando pro Postgres certo — lê do
 * ambiente ou cai no .env do projeto.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import bcrypt from "bcryptjs";

const ROOT = process.cwd();
const SALT_ROUNDS = 12; // mesmo valor de src/lib/auth/password.ts

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([a-zA-Z]+)=(.*)$/);
    if (match) out[match[1]] = match[2];
  }
  return out;
}

async function readEnvFile() {
  const file = path.join(ROOT, ".env");
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

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL não encontrada (nem no ambiente, nem no .env).");
    process.exit(1);
  }

  const email = args.email ?? "dev@docobra.com";
  const senha = args.senha ?? "123456";
  const nomeEmpresa = args.empresa ?? "Empresa Dev";
  const nome = args.nome ?? "Usuário Dev";

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const existente = await client.query("SELECT id FROM usuario WHERE email = $1", [email]);
    if (existente.rows.length > 0) {
      console.log(`Usuário "${email}" já existe (id ${existente.rows[0].id}). Nada a fazer.`);
      return;
    }

    const senhaHash = await bcrypt.hash(senha, SALT_ROUNDS);

    await client.query("BEGIN");
    try {
      const { rows: empresaRows } = await client.query(
        "INSERT INTO empresa (nome) VALUES ($1) RETURNING id",
        [nomeEmpresa],
      );
      const empresaId = empresaRows[0].id;

      const { rows: usuarioRows } = await client.query(
        `INSERT INTO usuario (nome, email, senha_hash, empresa_id, papel)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id`,
        [nome, email, senhaHash, empresaId],
      );

      await client.query("COMMIT");

      console.log("Usuário criado com sucesso:");
      console.log(`  empresa: ${nomeEmpresa} (${empresaId})`);
      console.log(`  usuario: ${nome} (${usuarioRows[0].id})`);
      console.log(`  email:   ${email}`);
      console.log(`  senha:   ${senha}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
