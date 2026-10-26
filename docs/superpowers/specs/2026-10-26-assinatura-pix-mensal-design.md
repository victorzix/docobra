# Assinatura — Pix mensal (renovação, cancelamento e regras) — design

Data: 2026-10-26. Status: decisões fechadas em brainstorm, aguardando revisão do usuário.
Base: Fases 4a e 4b (cobrança Pix avulsa pelo Asaas, tela de Assinatura, prazo de 25 minutos do Pix) no branch `feat/planos-fase-4b`.
Escopo: regras de assinatura para **Pix em plano mensal**. Cartão, plano anual e e-mail próprio ficam para fases seguintes.

## Decisões fechadas

| Tema | Decisão |
| --- | --- |
| Formas de pagamento | Só **Pix** agora. **Sem boleto**, nem como exceção do suporte |
| Periodicidade | Pix só para plano **mensal** (ciclo de 30 dias). Plano anual será só cartão, numa fase futura |
| Dono da recorrência | O **app**. O Asaas é só processador: Pix avulso agora e, no futuro, cartão com token cobrado pelo nosso cron |
| Forma de pagamento da assinatura | A forma do primeiro pagamento é a das renovações. Só o suporte muda. Como só existe Pix, **nenhum campo novo agora**: o campo entra junto com o cartão |
| Antecedência da renovação | **10 dias** antes do vencimento (hoje 5): o cron gera a cobrança, o botão Renovar aparece e o banner avisa |
| Lembretes | E-mails do Asaas continuam (cobrança criada e vencimento). **Banner dentro do app** é novo. E-mail próprio fica para depois |
| Valor da renovação | Preço do catálogo no dia em que a cobrança é gerada. Sem desconto, cupom ou preço travado nesta fase |
| Upgrade | Mantém o valor proporcional (diferença de preço × dias restantes ÷ ciclo), sem reiniciar o ciclo |
| Downgrade | Só pelo suporte, **imediato e sem crédito**, pelo `admin-plano trocar-plano` que já existe |
| Cortesia | Os comandos atuais cobrem: `estender` (soma dias) e `trocar-plano` |
| Cancelamento | **Botão** na tela de Assinatura, com confirmação |

## 1. Pix só mensal

- Constante `CICLO_MENSAL_DIAS = 30` (módulo sem banco, como `validade-do-pix.ts`).
- `iniciarCobranca` recusa plano de ciclo diferente de 30 dias com `CobrancaNaoPermitidaError("pix_somente_mensal", "...")`, que a rota devolve como `409 COBRANCA_NAO_PERMITIDA`, como os demais motivos.
- `carregarTelaDePlanos` ganha a ação `em_breve` para esses planos: o card mostra "Disponível em breve no cartão" desabilitado.
- O cron só gera renovação de assinatura em plano mensal.

## 2. Antecedência de 10 dias e avisos

- `ANTECEDENCIA_RENOVACAO_DIAS_PADRAO` passa de 5 para 10. A constante já alimenta o cron (`gerar-renovacoes.ts`) e a janela do botão Renovar (`carregar-tela-de-planos.ts`).
- Pagar antes do vencimento continua emendando no vencimento antigo: quem renova cedo não perde dias.
- **Banner no dashboard** (`DashboardLayout`), calculado no servidor por uma função pura `descreverAvisoDeRenovacao` (em `lib/planos/`, com testes):
  - na janela de 10 dias: "Sua assinatura vence em N dias" com link para Renovar;
  - em carência: tom de alerta, "Pagamento em atraso: regularize até dd/mm";
  - assinatura cancelada com acesso restante: "Assinatura cancelada: acesso até dd/mm", com link para reativar (ver seção 4);
  - sem aviso nos demais casos.
- O banner reaproveita a leitura da assinatura que a página já faz; não duplica consulta além do necessário.

## 3. Valor e troca de plano

- O valor da renovação é `plano.precoCentavos` no momento da geração. Reajuste do catálogo vale na renovação seguinte.
- Upgrade: sem mudança no cálculo (`simularUpgrade`, com o mínimo do ambiente).
- Downgrade e troca de plano fora do upgrade seguem pelo suporte (`trocar-plano`, mantém o dia 0 e o consumo, não gera cobrança). Sem plano agendado e sem crédito.

## 4. Cancelamento

- Botão "Cancelar assinatura" na tela de Assinatura, visível só para assinatura paga (`ativa`) dentro do ciclo vigente (em carência o acesso já é de tolerância e cancelar o encerraria na hora, então o botão não aparece); o diálogo de confirmação explica "você mantém o acesso até dd/mm e não haverá novas cobranças".
- `POST /api/assinatura/cancelar` (sessão obrigatória, sem corpo, então sem schema Zod):
  - marca `assinatura.status = "cancelada"` e mantém `venceEm`;
  - cancela as cobranças pendentes ou vencidas da assinatura, localmente e, depois do commit, no gateway (mesmo padrão de `aplicarPagamento`);
  - responde 409 se a assinatura não estiver cancelável.
- `derivarStatus` já trata `cancelada` como acesso até o vencimento e `suspensa` depois. O cron só considera `status = ativa`, então para de gerar renovações sem mudança.
- **Reativação antes do vencimento (a confirmar):** hoje `cancelada` leva à ação `assinar`, que reinicia o ciclo no pagamento e faz o cliente perder os dias restantes. Recomendação: permitir `renovacao` também para `cancelada` com vencimento futuro. A renovação emenda no vencimento antigo e já volta o status para `ativa` em `aplicarPagamento`. Exige ajustar `planejar` e a ação do card.

## 5. Testes

- `iniciarCobranca`: recusa plano não mensal; renovação de `cancelada` (se confirmada a reativação).
- Loader: ação `em_breve`; janela do Renovar em 10 dias; ação para `cancelada`.
- `descreverAvisoDeRenovacao`: cada estado do banner.
- Cancelamento: efeito na assinatura e nas cobranças pendentes; cobrança no gateway cancelada depois do commit; 409 fora de estado; sessão obrigatória.
- Cron: janela de 10 dias, ignora `cancelada` e plano anual.
- UI verificada no navegador (Playwright): banner nos três estados, botão e diálogo de cancelar, card `em_breve`.

## Fora desta fase

Cartão (token, cobrança recorrente, novas tentativas, PCI), plano anual, Pix Automático, boleto, e-mail próprio de lembrete, desconto ou cupom, plano agendado e crédito proporcional no downgrade, forma de pagamento editável.
