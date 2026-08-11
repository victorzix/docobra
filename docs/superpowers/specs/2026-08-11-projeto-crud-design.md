# CRUD Mínimo de Projeto — Design Spec

## Problema

`memorialDescritivo` e `comuniqueSe` (schema Drizzle já existente) referenciam
`projeto` via `projetoId` (`notNull`), mas não existe hoje nenhuma UI pra
criar ou listar projetos. Nenhum dos dois módulos de produto pode ser usado
de ponta a ponta sem isso. Esta é a primeira de duas specs decompostas a
partir do brainstorm do Gerador de Memorial Descritivo — a segunda (geração
do memorial propriamente) depende desta existir primeiro.

## Escopo

Dentro: criar projeto (nome + endereço), listar projetos — ambos escopados
à empresa do usuário logado.

Fora: editar, excluir, busca/filtro, paginação. Qualquer UI de seleção de
projeto dentro do fluxo do Memorial Descritivo ou do Comunique-se (esses
módulos vão consumir a lista de projetos criada aqui, mas isso é escopo de
specs futuras).

## Comportamento observável

### Criar

`POST /api/projetos` — body `{ nome: string, endereco?: string }`.
- `nome` vazio → `400 { error: "Dados inválidos.", fields: {...} }` (mesmo
  formato de erro já usado em `/api/auth/register`).
- Sucesso → `201 { projeto: { id, nome, endereco, createdAt } }`, insere
  com `empresaId` vindo da sessão (nunca do body — o cliente não escolhe
  pra qual empresa o projeto pertence).

### Listar

`/dashboard/projetos` (Server Component): busca todos os projetos onde
`empresaId` é o da sessão, ordenados por `createdAt desc`. Sem paginação —
lista completa (volume esperado é baixo no MVP).

### UI

- Novo item "Projetos" na sidebar do dashboard, entre os módulos existentes
  (ou antes deles — decisão de layout na hora do plano, não estrutural).
- `/dashboard/projetos`: lista de `Card`s (nome + endereço), botão "Novo
  projeto" abre um `Dialog` (shadcn, já instalado) com formulário
  (`nome`, `endereco`). Sucesso fecha o dialog e chama `router.refresh()`
  pra re-buscar a lista (sem cache client de projetos ainda).
- Lista vazia: mensagem simples ("Nenhum projeto ainda.") + o mesmo botão
  "Novo projeto".

## Modos de falha

| Cenário | Comportamento |
|---|---|
| `nome` vazio ou ausente | `400`, formulário mostra erro inline (mesmo padrão do register) |
| Erro de banco na criação | `500 { error: "Erro interno, tente novamente." }` (mesmo padrão dos outros Route Handlers de auth) |
| Usuário sem projetos | Lista vazia com CTA pra criar o primeiro |

## Como se prova que funciona

- Teste de integração do Route Handler (`POST /api/projetos`): cria com
  sucesso e escopa `empresaId` corretamente; rejeita `nome` vazio com 400;
  dois usuários de empresas diferentes não veem os projetos um do outro
  (teste cria 2 empresas, confirma isolamento na listagem).
- Teste de integração da query de listagem: retorna só os projetos da
  empresa pedida, ordenados por `createdAt desc`.
- Verificação manual final (mesmo padrão das features anteriores): criar
  projeto pela UI, ver aparecer na lista, criar um segundo usuário/empresa
  e confirmar que não vê o projeto do primeiro.

## Decisões

- **Route Handler + React Query pra criar, Server Component direto pra
  listar** — mesmo padrão arquitetural já usado em toda a feature de auth
  (`useRegister`/`useLogin` + Route Handlers; `/dashboard` já busca dados
  direto num Server Component). Não introduz Server Actions como um
  paradigma novo só pra esta feature.
- **Sem cache client (React Query) pra listagem** — só um `router.refresh()`
  após criar. A lista de projetos não é acessada com frequência alta o
  suficiente pra justificar cache/invalidação agora.
- **`empresaId` sempre da sessão, nunca do body da request** — mesma regra
  de segurança já aplicada no registro de usuário (o cliente nunca escolhe
  a que empresa algo pertence).

## Empurrado pra depois

- Editar/excluir projeto.
- Seleção de projeto dentro dos fluxos de Memorial Descritivo/Comunique-se
  (specs futuras, mas vão consumir a listagem criada aqui).
- Qualquer campo adicional em Projeto além de `nome`/`endereco` (o schema
  Drizzle já não tem mais que isso hoje).
