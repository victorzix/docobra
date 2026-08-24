# Landing Page (Página de Vendas) — Design

## Contexto

O DocObra ainda não tem nenhuma página de apresentação/vendas — `src/app/page.tsx`
é o boilerplate padrão do `create-next-app`, nunca tocado. O CLAUDE.md já
antecipa a existência futura de uma "landing/página de vendas (marketing)" só
pra escopar o uso de Anime.js (permitido lá, proibido no resto do
app/dashboard). Este spec fecha o que essa página é de fato.

Objetivo duplo: (1) página pública real, pensada pra converter visitante em
cadastro, e (2) material de apresentação do produto (pra mostrar a
investidor/parceiro/cliente-piloto). Não depende de nenhum trabalho de
gerenciamento de usuários/empresas — essa é uma frente separada, adiada por
decisão explícita (ver "Fora de escopo").

## Arquitetura e roteamento

- `src/app/page.tsx` deixa de ser o boilerplate e passa a renderizar a
  landing. Continua em `/` — sem rota nova.
- **Sem redirect automático.** Usuário logado também vê a landing normalmente
  em `/` (decisão explícita — a página deve estar sempre visível, inclusive
  pra quem já tem conta, ex.: pra mostrar o produto pra alguém). A única
  mudança condicionada à sessão é no header: chama o mesmo `getSessionUser()`
  que `src/app/dashboard/layout.tsx` já usa, e troca o CTA principal do
  header entre "Entrar" + "Cadastre-se" (deslogado) e "Ir pro dashboard"
  (logado).
- Nenhuma mudança de schema, rota de API ou middleware. É puramente uma nova
  árvore de componentes de apresentação.

## Estrutura de arquivos

```text
src/app/page.tsx                        -> monta a landing (server component,
                                            só busca a sessão pro header)
src/components/landing/
  header.tsx                            -> nav fixo, logo, links âncora, CTA
                                            condicionado à sessão
  hero.tsx                              -> título/subtítulo, CTA "Comece
                                            agora", cena 3D de fundo
  scroll-scene.tsx                      -> cena 3D com Anime.js reagindo ao
                                            scroll (ver seção própria abaixo)
  como-funciona.tsx                     -> dois blocos (Memorial,
                                            Comunique-se), screenshot + copy
  planos.tsx                            -> os 2 cards de plano
  faq.tsx                               -> accordion de perguntas
  cta-footer.tsx                        -> chamada final + rodapé
```

Cada arquivo de seção é um Client ou Server Component conforme a necessidade
(seções com `whileInView`/Anime.js precisam ser Client; `planos.tsx` e
`faq.tsx`, sem estado, podem ser Server Components puros renderizando
conteúdo estático). `page.tsx` importa e empilha as seções na ordem: Header,
Hero, ComoFunciona, Planos, Faq, CtaFooter.

## Cena 3D com scroll (Anime.js)

Reaproveita o padrão já estabelecido em `src/app/(auth)/floor-scene.tsx` e
`floor-scene-3d.tsx` (chão isométrico se montando + volume girando), mas
adaptado: em vez de rodar em loop constante, a animação avança conforme a
posição de scroll da página (progresso 0–1 do scroll ao longo da seção Hero,
usando os mesmos primitivos de cena isométrica dos arquivos de auth como
referência de implementação, não necessariamente o mesmo arquivo).

Confirma o **CLAUDE.md**: Anime.js segue restrito à landing — nenhuma nova
tela do dashboard ganha 3D por causa deste trabalho.

## Seções — conteúdo

### Header
Logo "DocObra", links âncora pra `#como-funciona`, `#planos`, `#faq`. CTA à
direita: "Entrar" (→ `/login`) + "Cadastre-se" (→ `/register`) se deslogado;
"Ir pro dashboard" (→ `/dashboard`) se logado.

### Hero
Título e subtítulo com a proposta de valor central: gerar Memorial
Descritivo formatado em ABNT e traduzir exigências de Comunique-se da
prefeitura em checklist, ambos automatizados. CTA principal "Comece agora"
→ `/register`. Cena 3D de fundo (`scroll-scene.tsx`).

### Como funciona
Dois blocos lado a lado (ou empilhados em mobile), um por módulo:
- **Memorial Descritivo**: screenshot real do formulário/resultado + copy
  curta sobre o fluxo (formulário curto → documento ABNT completo).
- **Comunique-se**: screenshot real do checklist + copy curta sobre o fluxo
  (upload do PDF da prefeitura → checklist em linguagem simples).

Screenshots são capturados via Playwright contra o app rodando localmente
(dev server), usando dados de exemplo criados no banco de dev pra essa
finalidade — não são fixtures versionadas nem mock de UI.

### Planos
Dois cards, sem preço em R$ (ainda não definido — MVP evita fechar pricing
antes de validar):
- **Essencial**: projetos limitados por mês, os dois módulos completos.
- **Escritório**: projetos ilimitados, suporte prioritário — indicado pra
  escritórios com volume maior.

Ambos os cards têm CTA "Começar agora" → `/register`. **Não há seleção de
plano real no cadastro** — o campo `plano` da tabela `Empresa` (já existente
no schema) não é setado dinamicamente por essa página; a diferenciação de
plano é só apresentação até que exista um módulo de billing/upgrade (fora de
escopo, ver abaixo).

### FAQ
Accordion (shadcn — precisa adicionar via `npx shadcn add accordion`, ainda
não existe em `src/components/ui/`) com perguntas cobrindo objeções comuns:
segurança/privacidade dos dados de projeto, formatos de PDF aceitos no
Comunique-se, se dá pra usar em celular, etc. Copy definida na implementação.

### CTA final + rodapé
Chamada final de cadastro repetindo o CTA do hero, seguida de rodapé com
links institucionais e ano corrente.

## Estilo e libs

- Framer Motion pras animações de entrada normais (fade/slide via
  `whileInView`), consistente com o resto do app.
- Anime.js só na cena 3D do Hero (`scroll-scene.tsx`), consistente com a
  exceção já aberta pro `(auth)`.
- Componentes shadcn como base; o que faltar (`Accordion`) é adicionado via
  CLI, não escrito à mão.
- Copy toda em PT-BR, tom direto, mesmo estilo do resto do app (ex.: copy do
  `register-form.tsx`).

## Fora de escopo (decisão explícita)

- **Gerenciamento de usuários/empresas**: levantado durante o brainstorm,
  adiado de propósito. Depende do TODO já registrado no CLAUDE.md (definir
  papéis/permissões antes de checar autorização) — vira o próximo
  brainstorm, não faz parte deste spec.
- **Pricing real (valores em R$) e seleção de plano no cadastro**: os cards
  de plano são apresentação; nenhum valor numérico nem lógica de
  billing/upgrade é implementada agora.
- **Redirect condicional por sessão**: descartado explicitamente — a landing
  é sempre visível em `/`, logado ou não.

## Testes

Como é uma página de apresentação sem lógica de negócio nova (sem rota de
API, sem mutação, sem query), não há teste unitário de backend a escrever.
Verificação é visual/manual: rodar o dev server e conferir a página
renderizada, os CTAs levando pras rotas certas, e o comportamento do header
logado vs. deslogado.
