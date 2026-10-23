#!/usr/bin/env node
/**
 * Verificação manual do sandbox do Asaas. NÃO faz parte dos testes: usa a rede e
 * a sua chave. Cria um cliente e uma cobrança Pix de R$ 5,00, consulta pelo
 * externalReference, busca o QR Code e cancela a cobrança no fim.
 *
 * Uso:
 *   node scripts/asaas-sandbox-check.mjs --cpfcnpj=<CPF ou CNPJ válido>
 *
 * Lê ASAAS_API_KEY e ASAAS_BASE_URL do ambiente ou do .env (padrão: sandbox).
 * Recusa rodar contra um endereço que não seja o do sandbox.
 */

import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const BASE_SANDBOX = "https://api-sandbox.asaas.com";

async function lerEnv() {
  const arquivo = path.join(process.cwd(), ".env");
  if (!existsSync(arquivo)) return {};
  const saida = {};
  for (const linha of (await readFile(arquivo, "utf8")).split("\n")) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) saida[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return saida;
}

function lerArgumento(nome) {
  const prefixo = `--${nome}=`;
  const achado = process.argv.slice(2).find((arg) => arg.startsWith(prefixo));
  return achado ? achado.slice(prefixo.length) : undefined;
}

async function chamar(base, chave, metodo, caminho, corpo) {
  const resposta = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "docobra" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {
    // resposta sem corpo JSON
  }
  if (!resposta.ok) {
    throw new Error(`${metodo} ${caminho} → ${resposta.status}: ${texto.slice(0, 400)}`);
  }
  return json;
}

function passo(titulo, dados) {
  console.log(`\n▶ ${titulo}`);
  if (dados !== undefined) console.log(JSON.stringify(dados, null, 2));
}

async function main() {
  const env = { ...(await lerEnv()), ...process.env };
  const chave = env.ASAAS_API_KEY;
  const base = env.ASAAS_BASE_URL || BASE_SANDBOX;
  const documento = lerArgumento("cpfcnpj");

  if (!chave) throw new Error("ASAAS_API_KEY não definida (ambiente ou .env).");
  if (!documento) throw new Error("Informe --cpfcnpj=<CPF ou CNPJ válido>.");
  if (base !== BASE_SANDBOX) {
    throw new Error(`Este script só roda no sandbox (${BASE_SANDBOX}). ASAAS_BASE_URL atual: ${base}`);
  }

  const referencia = randomUUID();
  const vencimento = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const cliente = await chamar(base, chave, "POST", "/v3/customers", {
    name: "DocObra — teste de sandbox",
    cpfCnpj: documento.replace(/\D/g, ""),
    externalReference: `teste-${referencia}`,
  });
  passo("Cliente criado", { id: cliente.id });

  const pagamento = await chamar(base, chave, "POST", "/v3/payments", {
    customer: cliente.id,
    billingType: "PIX",
    value: 5,
    dueDate: vencimento,
    externalReference: referencia,
    description: "DocObra — teste de sandbox",
  });
  passo("Cobrança Pix criada", { id: pagamento.id, status: pagamento.status, invoiceUrl: pagamento.invoiceUrl });

  const qr = await chamar(base, chave, "GET", `/v3/payments/${pagamento.id}/pixQrCode`);
  passo("QR Code", {
    expirationDate: qr.expirationDate,
    payloadComeca: String(qr.payload).slice(0, 40),
    imagemBase64Bytes: String(qr.encodedImage).length,
  });

  const busca = await chamar(base, chave, "GET", `/v3/payments?externalReference=${referencia}&limit=10`);
  passo("Consulta por externalReference", { encontradas: busca.data.map((p) => p.id), totalCount: busca.totalCount });

  await chamar(base, chave, "DELETE", `/v3/payments/${pagamento.id}`);
  passo("Cobrança cancelada (DELETE)");

  console.log("\n✔ Sandbox respondeu a todas as chamadas que o DocObra usa.");
  console.log("  Falta validar o webhook: veja docs/pagamentos-asaas.md.");
}

main().catch((erro) => {
  console.error(`\n✖ ${erro.message}`);
  process.exit(1);
});
