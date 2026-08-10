# DocObra — Regras do Projeto

MVP para engenheiros/arquitetos. Prazo: 1 a 2 meses. Objetivo: validar rápido, sem
over-engineering. Toda decisão de arquitetura aqui já foi discutida e fechada —
não reabrir debate sobre stack sem motivo concreto (bug, limitação real).

## Escopo (fechado)

Dois módulos, um produto só (login único, mesmo dashboard, mesmo banco):

1. **Gerador de Memorial Descritivo** — formulário curto (+ opcionalmente entrada
   por áudio/voz) → documento técnico completo formatado em ABNT.
2. **Tradutor de Exigências da Prefeitura** — upload de PDF de "Comunique-se" →
   checklist de tarefas em linguagem simples.

Fora de escopo por agora: Diário de Obra por áudio (idea 1), WhatsApp, app
nativo iOS/Android (pode vir depois da validação web).

## Stack

- **Frontend + backend**: Next.js full-stack (App Router). API routes/server
  actions no mesmo projeto — evita 2 deploys separados no Coolify.
- **Banco**: Postgres.
- **ORM**: Drizzle.
- **Auth**: local, custom (bcrypt + JWT). Sem provedor terceiro (Clerk/Auth.js) —
  self-hosted, sem custo recorrente, mais rápido de implementar aqui do que
  integrar um vendor externo.
- **Geração de PDF**: Puppeteer (HTML/CSS → PDF). Controle total de layout para
  formatação ABNT.
- **Hospedagem**: VPS própria via Coolify (configurar depois, não é prioridade
  de MVP).

## Frontend — componentes, estado e animações

- **Componentes**: shadcn/ui é a base. O que não existir no shadcn vai em
  `components/common` (ou `shared`) — não criar componente do zero se o
  shadcn já cobre.
- **Formulários**: React Hook Form + Zod. Schema de validação sempre em
  arquivo separado do componente (ex.: `memorial-form.schema.ts` ao lado de
  `memorial-form.tsx`), nunca inline dentro do componente.
- **Estado do servidor** (dados de API, resultado de extração de LLM, status
  de processamento): React Query. É a fonte de verdade para qualquer coisa
  que vem do backend — cache, refetch, mutation.
- **Estado global do cliente** (UI state que não é do servidor — ex.: sidebar
  aberta, filtro ativo, modal): Zustand. Não persistente por padrão; usar
  middleware de persist só quando o dado realmente precisa sobreviver reload.
- **Sem prop drilling**: se um valor precisa passar por mais de 2 níveis de
  componente, ele pertence ao Zustand (ou ao React Query, se for dado de
  servidor) — não empilhar props.
- **Animações**: Framer Motion é o padrão em toda a aplicação (dashboard,
  formulários, transições). Anime.js é permitido, mas **escopado
  exclusivamente à landing/página de vendas** (marketing), para elementos
  visuais 3D de apresentação — nunca dentro do app/dashboard. Motivo: o app
  em si não tem nenhuma necessidade de 3D (não há planta/CAD/visualização
  nos módulos), então misturar as duas libs no app só adicionaria bundle e
  complexidade sem ganho.

## Camada de LLM — regra mais importante do projeto

**Provider default é o Gemini, não o Claude.** Motivo: free tier aceita áudio
nativamente e cobre o volume esperado no início. Claude entra como fallback
pago quando o Gemini falhar ou estourar quota.

Toda chamada de IA passa por uma camada de abstração multi-provider — nunca
chamar o SDK de um provider diretamente fora dessa camada:

```text
core/llm/
  types.ts       -> interface LLMProvider (extractStructured, transcribeAudio?)
  gemini.ts      -> GeminiProvider (default)
  claude.ts      -> ClaudeProvider (fallback)
  router.ts      -> LLMRouter: tenta providers em ordem, cai pro próximo em erro
```

Ordem de fallback por caso de uso é configurável (env var ou config), não
hardcoded no meio do código de negócio. Exemplo:

```ts
const memorialRouter = new LLMRouter([
  new GeminiProvider(),  // default
  new ClaudeProvider(),  // fallback
]);
```

Regras específicas:

- Retry de erros transitórios (429, 5xx, rede) é responsabilidade do SDK de
  cada provider (`max_retries`), não reimplementar isso na mão.
- Fallback entre providers (Gemini → Claude) é responsabilidade do `LLMRouter`.
- Extração estruturada usa **structured outputs** (`output_config.format` com
  JSON Schema) no Claude — nunca usar prefill/truque de forçar JSON via
  assistant message (não é mais suportado nos modelos atuais e nunca foi a
  forma correta).
- **Limitação conhecida**: a API do Claude não tem endpoint de transcrição de
  áudio nativo. Se o Gemini cair, a funcionalidade de voz (Memorial Descritivo
  por áudio) fica temporariamente indisponível — não existe fallback de
  transcrição hoje. Ciente disso, aceito por ora.
- Modelo Claude default quando usado: `claude-sonnet-5` (bom equilíbrio
  custo/qualidade para extração de texto denso). Só subir para `claude-opus-5`
  se houver evidência de que o raciocínio do Sonnet não é suficiente (ex.:
  exigências ambíguas do Comunique-se).

## Modelo de dados (visão inicial)

```text
Empresa (nome, logo, plano)
Usuario (email, senha_hash, empresa_id, papel)
Projeto (nome, empresa_id, endereco)
MemorialDescritivo (projeto_id, respostas_formulario_json, audio_url?, documento_gerado_url, status)
ComuniqueSe (projeto_id, pdf_original_url, checklist_json, status)
```

`papel` existe como campo, mas os níveis de permissão ainda não estão
fechados — **TODO**: definir papéis (provavelmente algo como admin da
empresa vs. usuário comum) antes de implementar qualquer checagem de
autorização. Não bloquear o resto da arquitetura por isso.

## Segregação de arquivos (schema/CRUD)

Dois tipos de "schema" diferentes aqui — não confundir:

- **`db/schema/<entidade>.ts`** — definição de tabela do Drizzle. Um arquivo
  por entidade (é assim que o Drizzle funciona, não dá pra segregar isso por
  operação).
- **`lib/validations/<entidade>/`** — schemas Zod de validação de
  request/response de API. Aqui sim, nunca um arquivo único por entidade com
  create/update/delete/response juntos — separar por operação:

```text
lib/validations/usuario/
  create.schema.ts
  update.schema.ts
  delete.schema.ts
  response.schema.ts
```

Cada operação com seu próprio schema, não um schema genérico reaproveitado
para tudo.

## Convenções de código

- Sem comentários explicando O QUE o código faz — só comentar quando o PORQUÊ
  não é óbvio (uma restrição, um workaround específico).
- Não introduzir abstração além do que a tarefa pede agora. Três linhas
  parecidas são melhores que uma abstração prematura.
- Não adicionar validação/fallback para cenários que não podem acontecer.
  Validar só nas bordas do sistema (input do usuário, resposta de API externa).
- Preferir editar arquivo existente a criar novo.
- **Debounce e `useMemo` só em gargalo real identificado** (busca, autosave,
  cálculo comprovadamente caro em lista grande) — nunca por padrão/hábito.
  `useMemo` num valor barato de calcular é complexidade sem ganho.

## O que NÃO fazer sem perguntar

- Não trocar o provider default (Gemini) por Claude "porque é melhor" — é uma
  decisão de custo, não de qualidade.
- Não adicionar WhatsApp, app mobile nativo, ou o módulo de Diário de Obra sem
  isso ser puxado explicitamente de novo.
- Não integrar auth de terceiro (Clerk, Auth.js, NextAuth) sem justificativa
  concreta — a decisão de auth local já foi tomada.
- Não usar anime.js dentro do app/dashboard — está escopado só à landing/
  página de vendas. Se aparecer uma necessidade real de 3D dentro do produto,
  perguntar antes de expandir o escopo.
