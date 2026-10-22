# Planos e permissões — Fase 2 (aplicar nos pontos de uso) — design

Data: 2026-10-22. Status: aprovado em brainstorm, aguardando plano de implementação.
Base: `docs/superpowers/specs/2026-10-05-planos-permissoes-design.md` (Fase 1 já mergeada na `main`, PR #8).

## Objetivo

A Fase 1 criou o catálogo, os planos, a assinatura, o consumo e `verificarPermissao`,
mas nenhuma tela chama isso. Esta fase aplica a checagem nos pontos de uso que
gastam IA ou definem limite de plano, mostra o uso ao cliente, e dá ao suporte um
jeito de ajustar o plano de uma empresa sem tela de admin.

Fora desta fase: pagamento, cobrança e rateio (Fases 3 e 4), as permissões de acervo
(`acervo.listar` / `acervo.abrir` / `acervo.baixar`), tela de admin, o TODO dos papéis
de usuário e a investigação do `drizzle-kit push` (recria constraints a cada execução;
já acontece com `contador`).

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Trial sem pagamento | Cotas valem; a suspensão por data fica **desligada** por `ASSINATURA_SUSPENSAO_ATIVA` (padrão `false`), ligada só na Fase 4 |
| Permissões checadas | Só `memorial.gerar`, `comunique-se.processar`, `projetos.criar`, `memorial.audio` |
| Onde mostrar o uso | No cabeçalho de cada módulo (Memorial e Comunique-se), contextual |
| Limite estourado | Botão "Novo" desabilitado, mensagem com a data de renovação e botão de contato |
| Atalho de upgrade | Email pré-preenchido para o suporte (`SUPORTE_EMAIL`); vira pagamento na Fase 4 |
| Ajuste pelo suporte | Script `scripts/admin-plano.mjs`; sem tela e sem decidir papéis |

## 1. Checagem no servidor

Sempre no servidor (API routes), nunca só na interface.

**Contrato de bloqueio:** HTTP 403 com corpo
`{ error: string, codigo: "LIMITE_ATINGIDO" | "PERMISSAO_NEGADA", permissao: string, renovaEm: string | null }`
(`renovaEm` é o fim da janela atual, ISO 8601; nulo quando não há janela).
`LIMITE_ATINGIDO` quando é um limite esgotado; `PERMISSAO_NEGADA` quando a permissão
simplesmente não está no plano (booleana ausente).

**Pontos de uso** (rotas existentes em `src/app/api/`):

- `memoriais/route.ts` (POST) e `memoriais/[id]/retry/route.ts`: checa `memorial.gerar`
  antes de chamar a IA; registra o consumo só no sucesso, com o ID do memorial como
  referência. Se o corpo vier em modo áudio, checa também `memorial.audio`.
  O retry de um memorial que ainda não consumiu checa o limite de novo (outro item
  pode ter esgotado a cota nesse meio tempo).
- `comunique-se/route.ts` (POST) e `comunique-se/[id]/retry/route.ts`: checa
  `comunique-se.processar` **somente quando a IA vai rodar** (upload de PDF e retry de
  processamento). Comunique-se criado à mão ou reimportado do modelo exportado não
  passa pela checagem e não consome. Consumo no sucesso, referência = ID do item.
- `projetos/route.ts` (POST): checa `projetos.criar`; consumo no sucesso, referência =
  ID do projeto. Apagar projeto não devolve cota.

**Suspensão desligada:** `verificarPermissao` ganha um parâmetro opcional de opções
(`{ suspensaoAtiva?: boolean }`, padrão lido de `ASSINATURA_SUSPENSAO_ATIVA`). Com
`false`, nunca troca para o plano `suspenso`, mesmo com `derivarStatus` = `suspensa`.
`derivarStatus` continua puro e inalterado.

**Corrida:** duas requisições simultâneas podem passar do limite por 1; aceito no MVP,
sem lock.

## 2. Interface

- `GET /api/permissoes` devolve, para a empresa da sessão, o resultado de
  `verificarPermissao` das quatro permissões (permitido, limite, usado, restante e
  janela). Mesmo padrão de autenticação das outras rotas.
- Hook `usePermissoes` (React Query, chave `["permissoes"]`), invalidado depois de
  criar memorial, Comunique-se ou projeto, e quando uma rota devolve 403 de limite.
- Componente de cabeçalho de uso, nas páginas `dashboard/memorial/page.tsx` e
  `dashboard/comunique-se/page.tsx`: "12 de 90 · renova em 8 dias". Limite ilimitado
  (valor nulo) não mostra barra, só o texto de plano sem limite.
- Estados: normal, perto do limite (restante ≤ 20% do limite) e estourado. Estourado:
  o botão "Novo" do drawer vem desabilitado, com a mensagem e o botão
  "Falar com o suporte", que abre `mailto:` para `SUPORTE_EMAIL` com assunto e corpo
  pré-preenchidos (empresa, plano atual, o que tentou fazer).
- `novo-memorial-form.tsx`: a aba "Gravar áudio" aparece desabilitada com o motivo
  quando `memorial.audio` não está no plano.
- `projetos`: o botão de criar projeto segue o mesmo padrão de estado estourado.
- Se uma criação ainda assim voltar 403 (corrida, outra aba), os hooks de criação
  mostram a mensagem do servidor, não um erro genérico.

## 3. Ajuste manual pelo suporte — `scripts/admin-plano.mjs`

Script Node simples no estilo de `seed-usuario.mjs` e `seed-planos.mjs` (lê
`DATABASE_URL` do ambiente ou do `.env`; lógica exportada e a execução só quando
chamado direto, para ser testável). Ações:

- `mostrar --email=<usuario>`: imprime plano, trecho vigente, `vence_em`, uso por
  permissão na janela atual e sobrescritas ativas da empresa.
- `trocar-plano --email=<usuario> --plano=<chave>`: fecha o trecho vigente
  (`fim = agora`) e abre outro com origem `suporte`. **Mantém o dia 0 e o consumo**;
  não gera cobrança. Rejeita plano inexistente.
- `cota --email=<usuario> --permissao=<chave> --valor=<n> --janela-dias=<n>
  [--expira-em=<data>] [--motivo=<texto>]`: cria ou atualiza a sobrescrita
  (`empresa_permissao`).
- `estender --email=<usuario> --dias=<n>`: soma dias ao `vence_em` da assinatura.

A empresa é identificada pelo email de um usuário dela. Script npm: `admin:plano`.

## 4. Arrumações herdadas do review final da Fase 1

- `CHECK (janela_dias > 0)` em `plano_permissao` e `empresa_permissao` (o script de
  suporte passa a poder gravar janelas).
- O backfill de `seed-planos.mjs` deixa de rodar a cada start do container: só roda com
  `--preencher-existentes`. O `docker-entrypoint.sh` não passa a flag. Para o usuário
  de dev não ficar sem plano, `seed-usuario.mjs` cria a assinatura (plano `escritorio`,
  `ativa`) da empresa que ele cria.
- O backfill passa a usar `INSERT ... ON CONFLICT (empresa_id) DO NOTHING RETURNING id`
  e só insere o trecho quando a assinatura foi criada, para não quebrar com duas
  execuções cruzadas.
- Script npm `seed:planos` já existe (adicionado no fim da Fase 1).

## 5. Variáveis de ambiente novas

- `ASSINATURA_SUSPENSAO_ATIVA` (padrão `false`).
- `SUPORTE_EMAIL` (endereço do suporte; sem padrão — o botão de contato só aparece se
  estiver definida, e `.env.example` documenta as duas).

## 6. Testes (Vitest, banco real)

- Cada ponto de uso: bloqueia ao estourar (403 com o contrato acima), passa dentro do
  limite, não consome em falha da IA, não conta duas vezes no retry; Comunique-se
  manual e reimportado não consomem.
- `verificarPermissao` com `suspensaoAtiva` ligado e desligado (empresa vencida).
- `GET /api/permissoes`: só devolve a empresa da sessão; não autenticado → 401.
- Script de suporte: `trocar-plano` preserva dia 0 e consumo e fecha/abre trechos;
  `cota` cria e atualiza; `estender`; erros de plano ou email inexistente.
- Componente de cabeçalho de uso e hook: estados normal, perto do limite, estourado e
  ilimitado.
- Seed: `--preencher-existentes` obrigatório para o backfill; idempotência com
  `ON CONFLICT`.

## Ordem sugerida de entrega

1. Arrumações herdadas (CHECK, backfill com flag e `ON CONFLICT`, `seed-usuario`).
2. Opção `suspensaoAtiva` em `verificarPermissao`.
3. Contrato de bloqueio + checagem nas rotas (projetos, memoriais, Comunique-se).
4. `GET /api/permissoes` + hook.
5. Cabeçalho de uso e estados da interface.
6. Script `admin-plano.mjs`.
