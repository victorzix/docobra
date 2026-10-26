# Assinatura — Pix mensal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pix só para plano mensal, renovação com 10 dias de antecedência, reativação de assinatura cancelada como renovação, cancelamento pelo cliente e banner de aviso no dashboard.

**Architecture:** Regras de negócio ficam em `src/lib/pagamentos` e `src/lib/planos` (funções puras ou com banco, testadas com Vitest no banco de teste). O loader `carregarTelaDePlanos` decide a ação de cada card e a tela só obedece. O cancelamento é uma função de domínio + uma rota `POST`. O banner é calculado no servidor (layout do dashboard) por uma função pura.

**Tech Stack:** Next.js App Router, Drizzle + Postgres, React Query, shadcn/ui, Vitest. Sem componentes testados: a UI é verificada por `tsc`, `eslint` e navegador.

Spec: `docs/superpowers/specs/2026-10-26-assinatura-pix-mensal-design.md`.

## Global Constraints

- Sem over-engineering; comentários só para o PORQUÊ não óbvio; validação só nas bordas.
- Schemas Zod por operação em `lib/validations/<entidade>/<operacao>.schema.ts`. A rota de cancelar não tem corpo, então não tem schema.
- Animações: Framer Motion (nada de Anime.js no dashboard).
- Sem biblioteca de toast: erros aparecem inline.
- Rotas usam o padrão de sessão de `src/app/api/empresa/documento/route.ts` (cookie `SESSION_COOKIE_NAME` + `verificarToken`, 401 sem sessão).
- Vitest usa o banco real `docobra-local-test`: **nunca rodar duas execuções ao mesmo tempo**. Os testes de pagamentos usam os helpers de `src/lib/pagamentos/__tests__/helpers/cenario.ts` (`AGORA = 2026-06-15T12:00:00Z`, `criarCenario`, `inserirCobranca`, `limparCenarios`).
- Antecedência da renovação: **10 dias**. Carência: 5 dias (não muda). Ciclo mensal: **30 dias**.
- Commits só nesta branch, sem push, sem `git add -A` (adicionar arquivo por arquivo). Terminar mensagens de commit com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Pré-requisito

A árvore de trabalho precisa estar **limpa** antes da Tarefa 1: o usuário commita antes as mudanças pendentes da Fase 4b (configurações, carrossel, prazo do Pix, checkout, descrição da cobrança).

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/pagamentos/ciclo-mensal.ts` (novo) | constante `CICLO_MENSAL_DIAS` |
| `src/core/billing/renovacao.ts` | antecedência 5 → 10 |
| `src/lib/pagamentos/iniciar-cobranca.ts` | recusa não mensal; renovação de `cancelada` |
| `src/lib/pagamentos/gerar-renovacoes.ts` | ignora plano não mensal |
| `src/lib/planos/carregar-tela-de-planos.ts` | ações `reativar` e `em_breve`; `podeCancelar` |
| `src/lib/pagamentos/cancelar-assinatura.ts` (novo) | `cancelarAssinatura`, `podeCancelarAssinatura` |
| `src/app/api/assinatura/cancelar/route.ts` (novo) | `POST` de cancelamento |
| `src/hooks/use-cancelar-assinatura.ts` (novo) | mutation |
| `src/components/planos/cancelar-assinatura.tsx` (novo) | botão + diálogo |
| `src/components/planos/plano-card.tsx`, `planos-tela.tsx` | botões `reativar` e `em_breve`, bloco de cancelar |
| `src/lib/planos/dias-restantes.ts` (novo) | `diasRestantesAte` (usado pelo loader e pelo layout) |
| `src/lib/planos/descrever-aviso-de-assinatura.ts` (novo) | regra pura do banner |
| `src/components/dashboard/aviso-de-assinatura.tsx` (novo), `src/app/dashboard/layout.tsx` | banner |
| `docs/pagamentos-asaas.md` | notas de operação |

---

### Task 1: Pix só mensal e antecedência de 10 dias

**Files:**
- Create: `src/lib/pagamentos/ciclo-mensal.ts`
- Modify: `src/core/billing/renovacao.ts`, `src/lib/pagamentos/iniciar-cobranca.ts`, `src/lib/pagamentos/gerar-renovacoes.ts`
- Test: `src/core/billing/__tests__/renovacao.test.ts`, `src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`, `src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts`

**Interfaces:**
- Produces: `CICLO_MENSAL_DIAS = 30`; `CobrancaNaoPermitidaError` com `motivo === "pix_somente_mensal"` para plano de ciclo diferente.

- [ ] **Step 1: Atualizar os testes que dependem da antecedência (devem falhar)**

Em `src/core/billing/__tests__/renovacao.test.ts` linha 26: `expect(ANTECEDENCIA_RENOVACAO_DIAS_PADRAO).toBe(10);`.

Em `gerar-renovacoes.test.ts`:
- no teste `"ignora quem vence longe..."` (linha ~62) troque `ativaVencendoEm(10, "longe@x.com")` por `ativaVencendoEm(12, "longe@x.com")` (10 dias passa a entrar na janela);
- no teste `"respeita uma antecedência customizada"` use `ativaVencendoEm(12, "a@x.com")`, espere `0` com o padrão e `1` com `antecedenciaDias: 15`.

Adicione ao mesmo arquivo:

```ts
  it("ignora assinatura de plano que não é mensal", async () => {
    const cenario = await ativaVencendoEm(3, "anual@x.com");
    await db.insert(plano).values({
      chave: "anual-teste",
      nome: "Anual teste",
      nivel: 5,
      cicloDias: 360,
      precoCentavos: 90000,
      ativo: true,
      interno: false,
    });
    const [anual] = await db.select().from(plano).where(eq(plano.chave, "anual-teste"));
    await db.update(assinaturaTrecho).set({ planoId: anual.id }).where(eq(assinaturaTrecho.assinaturaId, cenario.assinaturaId));
    const provedor = criarProvedorFalso("asaas");

    const resumo = await gerarRenovacoes({ agora: AGORA, roteador: new PaymentRouter([provedor]) });

    expect(resumo).toEqual({ garantidas: 0, semDocumento: 0, falhas: 0 });
    expect(provedor.criarCobranca).not.toHaveBeenCalled();
    await db.update(assinaturaTrecho).set({ planoId: (await idDoPlano("essencial")) }).where(eq(assinaturaTrecho.assinaturaId, cenario.assinaturaId));
    await db.delete(plano).where(eq(plano.chave, "anual-teste"));
  });
```

Imports necessários no topo do arquivo: `eq` de `drizzle-orm`; `assinaturaTrecho`, `plano` de `@/db/schema`; `idDoPlano` de `./helpers/cenario`.

Em `iniciar-cobranca.test.ts`, dentro do `describe("assinatura", ...)`, acrescente (mesmo setup de plano anual temporário, removido ao final do teste):

```ts
    it("recusa plano que não é mensal (Pix só mensal)", async () => {
      const cenario = await criarCenario();
      await db.insert(plano).values({
        chave: "anual-teste",
        nome: "Anual teste",
        nivel: 5,
        cicloDias: 360,
        precoCentavos: 90000,
        ativo: true,
        interno: false,
      });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "assinatura",
        planoDestinoChave: "anual-teste",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);
      await db.delete(plano).where(eq(plano.chave, "anual-teste"));

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
      expect(erro.motivo).toBe("pix_somente_mensal");
    });
```

(`plano` de `@/db/schema` deve ser importado no arquivo se ainda não estiver.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/core/billing src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`
Expected: FAIL (antecedência 5; sem recusa de plano anual).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/ciclo-mensal.ts`:

```ts
// Módulo sem banco: o servidor e a tela (planos anuais ficam "em breve") compartilham o valor.
export const CICLO_MENSAL_DIAS = 30;
```

`src/core/billing/renovacao.ts`: `export const ANTECEDENCIA_RENOVACAO_DIAS_PADRAO = 10;`

`iniciar-cobranca.ts`: importe `CICLO_MENSAL_DIAS` e acrescente antes de `planejar`:

```ts
function exigirCicloMensal(plano: PlanoDoCatalogo): PlanoDoCatalogo {
  if (plano.cicloDias !== CICLO_MENSAL_DIAS) {
    throw new CobrancaNaoPermitidaError("pix_somente_mensal", "O pagamento por Pix está disponível apenas para planos mensais.");
  }
  return plano;
}
```

Em `planejar`: na renovação, `destino: exigirCicloMensal(c.atual)`; nos demais tipos, `const destino = exigirCicloMensal(exigirPlanoPublico(c.destinoSolicitado));`.

`gerar-renovacoes.ts`: importe `CobrancaNaoPermitidaError` e, no `catch`, antes do `else`:

```ts
      if (erro instanceof CobrancaNaoPermitidaError && erro.motivo === "pix_somente_mensal") continue;
```

(o `continue` vai antes do bloco `DocumentoAusenteError`/`else`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/core/billing src/lib/pagamentos src/app/api/cobrancas` (uma execução só)
Expected: PASS. Rode também `npx tsc --noEmit` e `npx eslint src/lib/pagamentos src/core/billing`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/ciclo-mensal.ts src/core/billing/renovacao.ts src/core/billing/__tests__/renovacao.test.ts src/lib/pagamentos/iniciar-cobranca.ts src/lib/pagamentos/gerar-renovacoes.ts src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts src/lib/pagamentos/__tests__/gerar-renovacoes.test.ts
git commit -m "feat(pagamentos): pix so para plano mensal e renovacao com 10 dias de antecedencia"
```

---

### Task 2: Reativar assinatura cancelada como renovação

**Files:**
- Modify: `src/lib/pagamentos/iniciar-cobranca.ts`, `src/lib/planos/carregar-tela-de-planos.ts`
- Test: `src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts`, `src/lib/pagamentos/__tests__/efeitos.test.ts`, `src/lib/planos/__tests__/carregar-tela-de-planos.test.ts`

**Interfaces:**
- Consumes: `planejar`, `derivarStatus`.
- Produces: `AcaoDoPlano` ganha `"reativar"` e `"em_breve"` (o `em_breve` é usado na Tarefa 3, mas o tipo nasce aqui para os testes do loader).

- [ ] **Step 1: Testes que devem falhar**

`iniciar-cobranca.test.ts`, no `describe("renovação")`:

```ts
    it("cancelada com o ciclo vigente: renovação é permitida e emenda no vencimento atual", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(10) });

      const criada = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      });

      expect(criada).toMatchObject({ tipo: "renovacao", valorCentavos: 9900 });
      expect(criada.venceEm).toEqual(emDias(10));
    });

    it("cancelada depois do vencimento: renovação continua recusada", async () => {
      const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(-1) });

      const erro = await iniciarCobranca({
        empresaId: cenario.empresaId,
        tipo: "renovacao",
        agora: AGORA,
        roteador: new PaymentRouter([criarProvedorFalso("asaas")]),
      }).catch((e) => e);

      expect(erro).toBeInstanceOf(CobrancaNaoPermitidaError);
    });
```

`efeitos.test.ts`:

```ts
  it("renovação de assinatura cancelada com ciclo vigente: volta para ativa e soma um ciclo ao vencimento", async () => {
    const venceEm = emDias(10);
    const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", inicio: emDias(-20), venceEm });
    const paga = await inserirCobranca(cenario, { tipo: "renovacao", planoChave: "essencial" });

    await aplicarPagamento(db, paga, AGORA);

    const depois = await assinaturaDe(cenario.assinaturaId);
    expect(depois.status).toBe("ativa");
    expect(depois.venceEm).toEqual(new Date(venceEm.getTime() + 30 * MS_POR_DIA));
    expect(depois.inicio).toEqual(emDias(-20));
  });
```

`carregar-tela-de-planos.test.ts`: troque o teste `"cancelada ainda dentro do ciclo: todos os planos são 'assinar'"` (linha ~113) por:

```ts
  it("cancelada ainda dentro do ciclo: o plano atual vira 'reativar' e os outros 'assinar'", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "cancelada", venceEm: emDias(10) });
    expect(await acoes(cenario.empresaId)).toEqual({ essencial: "reativar", escritorio: "assinar" });
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pagamentos src/lib/planos`
Expected: FAIL nos três arquivos (renovação recusada; ação `assinar`).

- [ ] **Step 3: Implementar**

`iniciar-cobranca.ts`, em `planejar`, substitua o cálculo de `renovavel`:

```ts
    const ativaNoCiclo =
      c.vigente.status === "ativa" && (c.statusEfetivo === "ativa" || c.statusEfetivo === "carencia");
    // Cancelada ainda com acesso: pagar reativa e emenda no vencimento, sem perder os dias já pagos.
    const reativavel = c.vigente.status === "cancelada" && c.statusEfetivo === "cancelada";
    const renovavel = ativaNoCiclo || reativavel;
```

`aplicarPagamento` (`efeitos.ts`) não muda: a renovação já grava `status: "ativa"`.

`carregar-tela-de-planos.ts`: em `AcaoDoPlano` acrescente `"reativar" | "em_breve"`. Em `decidirAcao`, antes de `const assinaturaPaga`:

```ts
  if (c.vigente.status === "cancelada" && c.status === "cancelada" && destino.chave === c.atual.chave) {
    return sem("reativar");
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/pagamentos src/lib/planos src/app/api/cobrancas`, `npx tsc --noEmit`, `npx eslint src/lib`.
Expected: PASS (o `tsc` vai acusar `reativar`/`em_breve` não tratados em `plano-card.tsx` só se houver `switch` exaustivo; hoje há `if`s, então deve passar).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/iniciar-cobranca.ts src/lib/planos/carregar-tela-de-planos.ts src/lib/pagamentos/__tests__/iniciar-cobranca.test.ts src/lib/pagamentos/__tests__/efeitos.test.ts src/lib/planos/__tests__/carregar-tela-de-planos.test.ts
git commit -m "feat(pagamentos): assinatura cancelada com ciclo vigente pode ser reativada como renovacao"
```

---

### Task 3: Cards `reativar` e `em_breve`

**Files:**
- Modify: `src/lib/planos/carregar-tela-de-planos.ts`, `src/components/planos/plano-card.tsx`, `src/components/planos/planos-tela.tsx`
- Test: `src/lib/planos/__tests__/carregar-tela-de-planos.test.ts`

**Interfaces:**
- Consumes: `CICLO_MENSAL_DIAS`, `AcaoDoPlano` da Tarefa 2.
- Produces: o loader devolve `acao: "em_breve"` para plano de ciclo diferente de 30 que não é o atual.

- [ ] **Step 1: Teste que deve falhar**

Em `carregar-tela-de-planos.test.ts` (importe `plano` de `@/db/schema` e `eq` de `drizzle-orm` se faltar):

```ts
  it("plano que não é mensal aparece como 'em_breve' (Pix só mensal)", async () => {
    await db.insert(plano).values({
      chave: "anual-teste",
      nome: "Anual teste",
      nivel: 5,
      cicloDias: 360,
      precoCentavos: 90000,
      ativo: true,
      interno: false,
    });
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(20) });

    const acoesPorPlano = await acoes(cenario.empresaId);
    await db.delete(plano).where(eq(plano.chave, "anual-teste"));

    expect(acoesPorPlano["anual-teste"]).toBe("em_breve");
    expect(acoesPorPlano.escritorio).toBe("upgrade");
  });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/planos`
Expected: FAIL (`anual-teste` vira `upgrade` ou `suporte`).

- [ ] **Step 3: Implementar**

Loader, no início de `decidirAcao` (depois de `const sem = ...`):

```ts
  if (destino.cicloDias !== CICLO_MENSAL_DIAS && destino.chave !== c.atual.chave) return sem("em_breve");
```

com `import { CICLO_MENSAL_DIAS } from "@/lib/pagamentos/ciclo-mensal";`.

`plano-card.tsx`:
- `ehAtual` continua `plano.ehAtual`.
- No bloco de botões, estenda a condição do botão principal para incluir `reativar` e trate `em_breve`:

```tsx
        {(plano.acao === "assinar" || plano.acao === "renovar" || plano.acao === "reativar" || plano.acao === "upgrade") && (
          <Button className="w-full" disabled={ocupado} onClick={() => onEscolher(plano)}>
            {plano.acao === "assinar" && "Assinar"}
            {plano.acao === "renovar" && "Renovar"}
            {plano.acao === "reativar" && "Reativar assinatura"}
            {plano.acao === "upgrade" && "Fazer upgrade"}
          </Button>
        )}

        {plano.acao === "em_breve" && (
          <Button variant="outline" className="w-full" disabled>
            Em breve no cartão
          </Button>
        )}
```

`planos-tela.tsx`, em `pedidoDoPlano`, trate `reativar` junto de `renovar` (mesmo input `{ tipo: "renovacao" }`), com `tipoRotulo: "Reativação"` e nota `"A assinatura volta a ficar ativa e o ciclo continua de onde parou."`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/planos`, `npx tsc --noEmit`, `npx eslint src/components/planos src/lib/planos`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planos/carregar-tela-de-planos.ts src/components/planos/plano-card.tsx src/components/planos/planos-tela.tsx src/lib/planos/__tests__/carregar-tela-de-planos.test.ts
git commit -m "feat(planos): cards de reativar assinatura e de plano em breve no cartao"
```

---

### Task 4: Cancelamento — domínio e rota

**Files:**
- Create: `src/lib/pagamentos/cancelar-assinatura.ts`, `src/app/api/assinatura/cancelar/route.ts`
- Modify: `src/lib/planos/carregar-tela-de-planos.ts` (campo `podeCancelar`)
- Test: `src/lib/pagamentos/__tests__/cancelar-assinatura.test.ts` (novo), `src/app/api/assinatura/cancelar/__tests__/route.test.ts` (novo), `src/lib/planos/__tests__/carregar-tela-de-planos.test.ts`

**Interfaces:**
- Produces: `cancelarAssinatura(empresaId, agora?, roteador?)`, `podeCancelarAssinatura(vigente, agora)`, `AssinaturaNaoCancelavelError`; `AssinaturaDaTela.podeCancelar: boolean`.

- [ ] **Step 1: Testes que devem falhar**

`cancelar-assinatura.test.ts` (padrão dos outros testes de pagamentos):

```ts
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { PaymentRouter } from "@/core/payments";
import { criarProvedorFalso } from "@/core/payments/__tests__/helpers/provedor-falso";
import { db } from "@/db";
import { semearCatalogoNoBancoDeTeste } from "@/db/__tests__/helpers/semear-catalogo";
import { assinatura, cobranca } from "@/db/schema";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { AssinaturaNaoCancelavelError, cancelarAssinatura } from "../cancelar-assinatura";
import { AGORA, criarCenario, inserirCobranca, limparCenarios } from "./helpers/cenario";

const emDias = (dias: number) => new Date(AGORA.getTime() + dias * MS_POR_DIA);

async function statusDaAssinatura(id: string) {
  const [linha] = await db.select({ status: assinatura.status, venceEm: assinatura.venceEm }).from(assinatura).where(eq(assinatura.id, id));
  return linha;
}

describe("cancelarAssinatura", () => {
  beforeAll(semearCatalogoNoBancoDeTeste);
  beforeEach(limparCenarios);
  afterEach(limparCenarios);

  it("assinatura ativa no ciclo: marca como cancelada e mantém o vencimento", async () => {
    const venceEm = emDias(10);
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm });

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([criarProvedorFalso("asaas")]));

    expect(await statusDaAssinatura(cenario.assinaturaId)).toEqual({ status: "cancelada", venceEm });
  });

  it("cancela as cobranças em aberto, no banco e no gateway", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    const pendente = await inserirCobranca(cenario, { tipo: "renovacao", providerChargeId: "pay_pendente" });
    const paga = await inserirCobranca(cenario, { tipo: "upgrade", planoChave: "escritorio", status: "paga", providerChargeId: "pay_paga" });
    const provedor = criarProvedorFalso("asaas");

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([provedor]));

    const [depoisPendente] = await db.select().from(cobranca).where(eq(cobranca.id, pendente.id));
    const [depoisPaga] = await db.select().from(cobranca).where(eq(cobranca.id, paga.id));
    expect(depoisPendente.status).toBe("cancelada");
    expect(depoisPaga.status).toBe("paga");
    expect(provedor.cancelarCobranca).toHaveBeenCalledTimes(1);
    expect(provedor.cancelarCobranca).toHaveBeenCalledWith("pay_pendente");
  });

  it("falha ao cancelar no gateway não desfaz o cancelamento", async () => {
    const cenario = await criarCenario({ planoChave: "essencial", status: "ativa", venceEm: emDias(5) });
    await inserirCobranca(cenario, { tipo: "renovacao" });
    const provedor = criarProvedorFalso("asaas");
    vi.mocked(provedor.cancelarCobranca).mockRejectedValue(new Error("fora do ar"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([provedor]));

    expect((await statusDaAssinatura(cenario.assinaturaId)).status).toBe("cancelada");
  });

  it.each([
    ["trial", { status: "trial" as const, venceEm: emDias(5) }],
    ["em carência", { status: "ativa" as const, venceEm: emDias(-2) }],
    ["suspensa", { status: "ativa" as const, venceEm: emDias(-10) }],
    ["já cancelada", { status: "cancelada" as const, venceEm: emDias(5) }],
  ])("recusa assinatura %s", async (_nome, opcoes) => {
    const cenario = await criarCenario({ planoChave: "essencial", ...opcoes });

    await expect(
      cancelarAssinatura(cenario.empresaId, AGORA, new PaymentRouter([criarProvedorFalso("asaas")])),
    ).rejects.toBeInstanceOf(AssinaturaNaoCancelavelError);
  });
});
```

`carregar-tela-de-planos.test.ts`: no teste da ativa vigente (venceEm +20, essencial) acrescente `expect(tela?.assinatura.podeCancelar).toBe(true);` e no de trial `expect(tela?.assinatura.podeCancelar).toBe(false);` (o `toEqual` do trial já compara o objeto inteiro: acrescente `podeCancelar: false` nele).

Rota (`src/app/api/assinatura/cancelar/__tests__/route.test.ts`), seguindo o padrão de `src/app/api/cobrancas/[id]/__tests__/route.test.ts` (token da empresa pelo helper `tokenDaEmpresa`, `NextRequest` com cookie). Cenários: sem sessão → 401; ativa no ciclo → 200 `{ ok: true }` e assinatura `cancelada`; trial → 409 com `codigo: "ASSINATURA_NAO_CANCELAVEL"`. Como a rota usa `pagamentoRouter()` de verdade no cancelamento de cobranças, o cenário de 200 não deve ter cobranças pendentes (sem chamada ao gateway).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/pagamentos/__tests__/cancelar-assinatura.test.ts src/lib/planos src/app/api/assinatura`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar**

`src/lib/pagamentos/cancelar-assinatura.ts`:

```ts
import { and, eq, inArray } from "drizzle-orm";

import { pagamentoRouter } from "@/core/payments";
import type { PaymentRouter } from "@/core/payments/router";
import { db } from "@/db";
import { buscarAssinaturaVigente, type AssinaturaVigente } from "@/db/queries/assinatura";
import { assinatura, cobranca } from "@/db/schema";
import { derivarStatus } from "@/lib/permissoes/status-assinatura";

export class AssinaturaNaoCancelavelError extends Error {
  constructor() {
    super("Só é possível cancelar uma assinatura paga e dentro do ciclo vigente.");
    this.name = "AssinaturaNaoCancelavelError";
  }
}

// Em carência o acesso já é de tolerância: cancelar ali o encerraria na hora, então fica de fora.
export function podeCancelarAssinatura(vigente: Pick<AssinaturaVigente, "status" | "venceEm">, agora: Date): boolean {
  return vigente.status === "ativa" && derivarStatus(vigente, agora) === "ativa";
}

export async function cancelarAssinatura(
  empresaId: string,
  agora: Date = new Date(),
  roteador?: PaymentRouter,
): Promise<void> {
  const vigente = await buscarAssinaturaVigente(empresaId);
  if (!vigente || !podeCancelarAssinatura(vigente, agora)) throw new AssinaturaNaoCancelavelError();

  const emAberto = await db.transaction(async (tx) => {
    const [alterada] = await tx
      .update(assinatura)
      .set({ status: "cancelada", updatedAt: agora })
      .where(and(eq(assinatura.id, vigente.id), eq(assinatura.status, "ativa")))
      .returning({ id: assinatura.id });
    if (!alterada) throw new AssinaturaNaoCancelavelError();

    return tx
      .update(cobranca)
      .set({ status: "cancelada", updatedAt: agora })
      .where(and(eq(cobranca.assinaturaId, vigente.id), inArray(cobranca.status, ["pendente", "vencida"])))
      .returning({ provider: cobranca.provider, providerChargeId: cobranca.providerChargeId });
  });

  // Rede fora da transação, como em aplicarPagamento: o cancelamento vale mesmo se o gateway falhar.
  for (const { provider, providerChargeId } of emAberto) {
    if (!provider || !providerChargeId) continue;
    try {
      await (roteador ?? pagamentoRouter()).provider(provider).cancelarCobranca(providerChargeId);
    } catch (erro) {
      console.error("[pagamentos] não foi possível cancelar a cobrança no gateway", providerChargeId, erro);
    }
  }
}
```

Confirme em `src/db/queries/assinatura.ts` que `AssinaturaVigente` tem `id`, `status` e `venceEm` (a Fase 4b já usa `vigente.id` em `iniciar-cobranca.ts`).

Rota `src/app/api/assinatura/cancelar/route.ts`:

```ts
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { verificarToken } from "@/lib/auth/jwt";
import { AssinaturaNaoCancelavelError, cancelarAssinatura } from "@/lib/pagamentos/cancelar-assinatura";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const sessao = token ? await verificarToken(token).catch(() => null) : null;

  if (!sessao) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    await cancelarAssinatura(sessao.empresaId);
    return NextResponse.json({ ok: true });
  } catch (erro) {
    if (erro instanceof AssinaturaNaoCancelavelError) {
      return NextResponse.json({ error: erro.message, codigo: "ASSINATURA_NAO_CANCELAVEL" }, { status: 409 });
    }
    console.error("[POST /api/assinatura/cancelar]", erro);
    return NextResponse.json({ error: "Erro interno, tente novamente." }, { status: 500 });
  }
}
```

Loader: em `AssinaturaDaTela` acrescente `podeCancelar: boolean;` e no retorno `podeCancelar: podeCancelarAssinatura(vigente, agora),` (importe de `@/lib/pagamentos/cancelar-assinatura`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/pagamentos src/lib/planos src/app/api/assinatura`, `npx tsc --noEmit`, `npx eslint src/lib src/app/api/assinatura`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pagamentos/cancelar-assinatura.ts src/app/api/assinatura src/lib/planos/carregar-tela-de-planos.ts src/lib/pagamentos/__tests__/cancelar-assinatura.test.ts src/lib/planos/__tests__/carregar-tela-de-planos.test.ts
git commit -m "feat(assinatura): cancelamento pelo cliente (dominio e rota)"
```

---

### Task 5: Cancelamento — botão e diálogo

**Files:**
- Create: `src/hooks/use-cancelar-assinatura.ts`, `src/components/planos/cancelar-assinatura.tsx`
- Modify: `src/components/planos/planos-tela.tsx`

**Interfaces:**
- Consumes: `POST /api/assinatura/cancelar`, `dados.assinatura.podeCancelar`, `dados.assinatura.venceEm`.

- [ ] **Step 1: Hook**

`src/hooks/use-cancelar-assinatura.ts`:

```ts
import { useMutation } from "@tanstack/react-query";

async function cancelarAssinatura(): Promise<void> {
  const response = await fetch("/api/assinatura/cancelar", { method: "POST" });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Não foi possível cancelar a assinatura.");
  }
}

export function useCancelarAssinatura() {
  return useMutation({ mutationFn: cancelarAssinatura });
}
```

- [ ] **Step 2: Componente**

`src/components/planos/cancelar-assinatura.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCancelarAssinatura } from "@/hooks/use-cancelar-assinatura";
import { formatarData } from "@/lib/formatar";

export function CancelarAssinatura({ venceEm }: { venceEm: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cancelar = useCancelarAssinatura();
  const [aberto, setAberto] = useState(false);

  function confirmar() {
    cancelar.mutate(undefined, {
      onSuccess: () => {
        setAberto(false);
        queryClient.invalidateQueries({ queryKey: ["permissoes"] });
        router.refresh();
      },
    });
  }

  return (
    <>
      <Button variant="ghost" className="justify-self-start text-muted-foreground" onClick={() => setAberto(true)}>
        Cancelar assinatura
      </Button>

      <Dialog open={aberto} onOpenChange={(abrir) => !cancelar.isPending && setAberto(abrir)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar assinatura?</DialogTitle>
            <DialogDescription>
              Você mantém o acesso até {formatarData(venceEm)} e não haverá novas cobranças. Para voltar, é só reativar
              antes dessa data.
            </DialogDescription>
          </DialogHeader>
          {cancelar.isError && <p className="text-sm text-destructive">{cancelar.error.message}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={cancelar.isPending} onClick={() => setAberto(false)}>
              Manter assinatura
            </Button>
            <Button variant="destructive" disabled={cancelar.isPending} onClick={confirmar}>
              {cancelar.isPending ? "Cancelando..." : "Cancelar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

Confirme que `DialogFooter` é exportado de `src/components/ui/dialog.tsx`; se não for, use `<div className="flex justify-end gap-2">`.

- [ ] **Step 3: Montar na tela**

Em `planos-tela.tsx`, importe `CancelarAssinatura` e renderize logo depois do `</Carrossel>`:

```tsx
      {dados.assinatura.podeCancelar && <CancelarAssinatura venceEm={dados.assinatura.venceEm} />}
```

- [ ] **Step 4: Verificar**

Run: `npx tsc --noEmit`, `npx eslint src/components/planos src/hooks`.
Expected: sem erros. Navegador (dev server na 3000): com uma assinatura `ativa` no ciclo, o botão aparece, o diálogo confirma, a tela recarrega mostrando o card do plano atual como "Reativar assinatura".

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-cancelar-assinatura.ts src/components/planos/cancelar-assinatura.tsx src/components/planos/planos-tela.tsx
git commit -m "feat(assinatura): botao e dialogo de cancelamento na tela de assinatura"
```

---

### Task 6: Banner de aviso no dashboard

**Files:**
- Create: `src/lib/planos/dias-restantes.ts`, `src/lib/planos/descrever-aviso-de-assinatura.ts`, `src/components/dashboard/aviso-de-assinatura.tsx`
- Modify: `src/lib/planos/carregar-tela-de-planos.ts` (usar `diasRestantesAte`), `src/app/dashboard/layout.tsx`
- Test: `src/lib/planos/__tests__/descrever-aviso-de-assinatura.test.ts`

**Interfaces:**
- Produces: `diasRestantesAte(venceEm: Date, agora: Date): number`; `descreverAvisoDeAssinatura(dados): AvisoDeAssinatura | null`.

- [ ] **Step 1: Teste que deve falhar**

`descrever-aviso-de-assinatura.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { descreverAvisoDeAssinatura } from "../descrever-aviso-de-assinatura";

const base = { venceEm: "2026-06-20T12:00:00Z", diasRestantes: 5 };

describe("descreverAvisoDeAssinatura", () => {
  it("ativa dentro da janela de renovação: avisa o vencimento e chama para renovar", () => {
    expect(descreverAvisoDeAssinatura({ ...base, status: "ativa" })).toEqual({
      tom: "normal",
      texto: "Sua assinatura vence em 5 dias (20/06/2026).",
      acao: "Renovar",
    });
  });

  it("usa o singular com 1 dia", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 1, status: "ativa" })?.texto).toBe(
      "Sua assinatura vence em 1 dia (20/06/2026).",
    );
  });

  it("ativa fora da janela: sem aviso", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 11, status: "ativa" })).toBeNull();
  });

  it("carência: alerta com o fim do prazo (vencimento + 5 dias)", () => {
    expect(descreverAvisoDeAssinatura({ ...base, diasRestantes: 0, status: "carencia" })).toEqual({
      tom: "alerta",
      texto: "Pagamento em atraso: regularize até 25/06/2026 para não perder o acesso.",
      acao: "Regularizar",
    });
  });

  it("cancelada com acesso: avisa até quando e oferece reativar", () => {
    expect(descreverAvisoDeAssinatura({ ...base, status: "cancelada" })).toEqual({
      tom: "alerta",
      texto: "Assinatura cancelada: você tem acesso até 20/06/2026.",
      acao: "Reativar",
    });
  });

  it.each(["trial", "suspensa"] as const)("%s: sem aviso", (status) => {
    expect(descreverAvisoDeAssinatura({ ...base, status })).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/planos/__tests__/descrever-aviso-de-assinatura.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/lib/planos/dias-restantes.ts`:

```ts
import { MS_POR_DIA } from "@/lib/permissoes/janela";

export const diasRestantesAte = (venceEm: Date, agora: Date): number =>
  Math.max(0, Math.ceil((venceEm.getTime() - agora.getTime()) / MS_POR_DIA));
```

No loader, troque o cálculo inline de `diasRestantes` por `diasRestantesAte(vigente.venceEm, agora)` (e remova o import de `MS_POR_DIA` se ficar sem uso).

`src/lib/planos/descrever-aviso-de-assinatura.ts`:

```ts
import { ANTECEDENCIA_RENOVACAO_DIAS_PADRAO } from "@/core/billing/renovacao";
import { formatarData } from "@/lib/formatar";
import { MS_POR_DIA } from "@/lib/permissoes/janela";
import { CARENCIA_DIAS_PADRAO, type StatusEfetivo } from "@/lib/permissoes/status-assinatura";

export interface AvisoDeAssinatura {
  tom: "normal" | "alerta";
  texto: string;
  acao: string;
}

export function descreverAvisoDeAssinatura(dados: {
  status: StatusEfetivo;
  venceEm: string;
  diasRestantes: number;
}): AvisoDeAssinatura | null {
  const { status, venceEm, diasRestantes } = dados;

  if (status === "ativa" && diasRestantes <= ANTECEDENCIA_RENOVACAO_DIAS_PADRAO) {
    const dias = `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;
    return { tom: "normal", texto: `Sua assinatura vence em ${dias} (${formatarData(venceEm)}).`, acao: "Renovar" };
  }

  if (status === "carencia") {
    const fim = new Date(new Date(venceEm).getTime() + CARENCIA_DIAS_PADRAO * MS_POR_DIA).toISOString();
    return {
      tom: "alerta",
      texto: `Pagamento em atraso: regularize até ${formatarData(fim)} para não perder o acesso.`,
      acao: "Regularizar",
    };
  }

  if (status === "cancelada") {
    return {
      tom: "alerta",
      texto: `Assinatura cancelada: você tem acesso até ${formatarData(venceEm)}.`,
      acao: "Reativar",
    };
  }

  return null;
}
```

`src/components/dashboard/aviso-de-assinatura.tsx`:

```tsx
import Link from "next/link";

import type { AvisoDeAssinatura as Aviso } from "@/lib/planos/descrever-aviso-de-assinatura";

const COR_DO_TOM = {
  normal: "border-primary/30 bg-primary/10 text-foreground",
  alerta: "border-amber-500/40 bg-amber-500/10 text-amber-900",
} as const;

export function AvisoDeAssinatura({ aviso }: { aviso: Aviso }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2 text-sm ${COR_DO_TOM[aviso.tom]}`}>
      <span>{aviso.texto}</span>
      <Link href="/dashboard/configuracoes/assinatura" className="font-medium underline-offset-4 hover:underline">
        {aviso.acao}
      </Link>
    </div>
  );
}
```

`src/app/dashboard/layout.tsx`: carregue a assinatura e monte o aviso (acima do `<div className="p-6">`):

```tsx
  const agora = new Date();
  const vigente = sessao ? await buscarAssinaturaVigente(sessao.empresaId) : null;
  const aviso = vigente
    ? descreverAvisoDeAssinatura({
        status: derivarStatus(vigente, agora),
        venceEm: vigente.venceEm.toISOString(),
        diasRestantes: diasRestantesAte(vigente.venceEm, agora),
      })
    : null;
```

e `{aviso && <AvisoDeAssinatura aviso={aviso} />}` entre o `<header>` e o `<div className="p-6">`. Importe `buscarAssinaturaVigente`, `derivarStatus`, `diasRestantesAte`, `descreverAvisoDeAssinatura` e o componente.

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/planos`, `npx tsc --noEmit`, `npx eslint src/lib/planos src/components/dashboard src/app/dashboard`.
Expected: PASS. Navegador: ativa a 5 dias do vencimento, em carência e cancelada mostram o banner nos três tons; trial e suspensa não mostram.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planos/dias-restantes.ts src/lib/planos/descrever-aviso-de-assinatura.ts src/lib/planos/carregar-tela-de-planos.ts src/components/dashboard/aviso-de-assinatura.tsx src/app/dashboard/layout.tsx src/lib/planos/__tests__/descrever-aviso-de-assinatura.test.ts
git commit -m "feat(assinatura): banner de aviso de renovacao, atraso e cancelamento no dashboard"
```

---

### Task 7: Documentação

**Files:**
- Modify: `docs/pagamentos-asaas.md`

- [ ] **Step 1: Atualizar**

- Seção 4 (Renovações): "5 dias" vira "10 dias antes do vencimento"; acrescente que o cron só gera renovação de plano mensal.
- Nova nota curta sobre o escopo: Pix só para plano mensal; plano anual e cartão ficam para a fase do cartão; sem boleto.
- Nota sobre cancelamento: botão na tela de Assinatura; cancelada mantém o acesso até o vencimento; reativar antes do vencimento é uma renovação (emenda no vencimento atual).
- Nota de operação: o `.env` local precisa do `$` inicial da chave do Asaas escapado (`\$aact_...`), porque o Next expande `$`; em produção (Coolify) não precisa.

- [ ] **Step 2: Verificação final**

Run (uma execução só): `npm test`, `npx tsc --noEmit`, `npx eslint src`, `npm run build`.
Navegador (Playwright, dev server na 3000): estados trial, ativa vencendo em 5 dias (banner), carência (banner), ativa no ciclo (botão Cancelar → diálogo → cancelada → card "Reativar" → Pix de renovação), card de plano anual "Em breve no cartão" (insira um plano `cicloDias = 360` temporário no banco de dev e remova depois).

- [ ] **Step 3: Commit**

```bash
git add docs/pagamentos-asaas.md
git commit -m "docs(pagamentos): antecedencia de 10 dias, escopo mensal, cancelamento e escape do cifrao no env"
```
