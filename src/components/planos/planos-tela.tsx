"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Carrossel } from "@/components/common/carrossel";
import { DocumentoDialog } from "@/components/planos/documento-dialog";
import { PixDialog, type ResumoDoPedido } from "@/components/planos/pix-dialog";
import { PlanoCard } from "@/components/planos/plano-card";
import { UsoDoPlano } from "@/components/planos/uso-do-plano";
import { descreverAssinatura } from "@/lib/planos/descrever-assinatura";
import { Card, CardContent } from "@/components/ui/card";
import { CobrancaError, useCriarCobranca } from "@/hooks/use-criar-cobranca";
import { rotuloDaPeriodicidade } from "@/lib/formatar";
import type { PlanoDaTela, TelaDePlanos } from "@/lib/planos/carregar-tela-de-planos";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import type { ContatoSuporte } from "@/lib/permissoes/contexto-de-planos";
import { montarMailtoSuporte } from "@/lib/permissoes/descrever-uso";
import type { CriarCobrancaInput } from "@/lib/validations/cobranca/create.schema";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

interface PlanosTelaProps {
  dados: TelaDePlanos;
  contatoSuporte: ContatoSuporte;
  permissoes: PermissoesDaEmpresa;
}

interface Pedido {
  resumo: ResumoDoPedido;
  input: CriarCobrancaInput;
}

function pedidoDoPlano(plano: PlanoDaTela): Pedido {
  const base = { planoNome: plano.nome, periodicidade: rotuloDaPeriodicidade(plano.cicloDias), limites: plano.limites };

  if (plano.acao === "renovar") {
    return {
      input: { tipo: "renovacao" },
      resumo: {
        ...base,
        tipoRotulo: "Renovação",
        valorCentavos: plano.precoCentavos,
        nota: "Mais um ciclo é somado ao vencimento atual.",
      },
    };
  }
  if (plano.acao === "reativar") {
    return {
      input: { tipo: "renovacao" },
      resumo: {
        ...base,
        tipoRotulo: "Reativação",
        valorCentavos: plano.precoCentavos,
        nota: "A assinatura volta a ficar ativa e o ciclo continua de onde parou.",
      },
    };
  }
  if (plano.acao === "upgrade") {
    return {
      input: { tipo: "upgrade", planoChave: plano.chave },
      resumo: {
        ...base,
        tipoRotulo: "Upgrade",
        valorCentavos: plano.valorUpgradeCentavos ?? plano.precoCentavos,
        nota: "Valor proporcional ao que falta do ciclo atual. O vencimento não muda.",
      },
    };
  }
  return {
    input: { tipo: "assinatura", planoChave: plano.chave },
    resumo: {
      ...base,
      tipoRotulo: "Assinatura",
      valorCentavos: plano.precoCentavos,
      nota: "O acesso é liberado assim que o pagamento for confirmado.",
    },
  };
}

export function PlanosTela({ dados, contatoSuporte, permissoes }: PlanosTelaProps) {
  const router = useRouter();
  const criar = useCriarCobranca();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cobranca, setCobranca] = useState<CobrancaResponse | null>(null);
  const [pedindoDocumento, setPedindoDocumento] = useState(false);
  // Fechar só esconde o modal: pedido e cobrança ficam até o próximo pedido, para o conteúdo não
  // sumir no meio da animação de saída.
  const [pagamentoAberto, setPagamentoAberto] = useState(false);

  const resumo = descreverAssinatura(dados.assinatura);

  function iniciar(novo: Pedido) {
    if (criar.isPending) return;
    setPedido(novo);
    setCobranca(null);
    setPagamentoAberto(true);
    criar.mutate(novo.input, {
      onSuccess: (criada) => {
        setCobranca(criada);
      },
      onError: (erro) => {
        const codigo = erro instanceof CobrancaError ? erro.codigo : undefined;
        if (codigo === "DOCUMENTO_AUSENTE") {
          setPedindoDocumento(true);
          setPagamentoAberto(false);
          return;
        }
        // O estado da assinatura mudou desde que a página foi carregada: recarrega os cards.
        if (codigo === "COBRANCA_NAO_PERMITIDA") router.refresh();
      },
    });
  }

  function cancelarPedido() {
    setPagamentoAberto(false);
    setPedindoDocumento(false);
  }

  function gerarNovo() {
    if (pedido) iniciar(pedido);
  }

  function linkSuporteDoPlano(plano: PlanoDaTela): string | null {
    if (!contatoSuporte.email) return null;
    return montarMailtoSuporte({
      email: contatoSuporte.email,
      empresaNome: contatoSuporte.empresaNome,
      planoChave: contatoSuporte.planoChave,
      motivo:
        plano.acao === "downgrade"
          ? `Quero fazer downgrade para o plano ${plano.nome}`
          : `Quero trocar para o plano ${plano.nome}`,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Assinatura</h1>
        <p className="mt-1 text-sm text-muted-foreground">Seu plano, seus limites e as opções para mudar.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Limites e uso do plano</h2>
          <UsoDoPlano permissoesIniciais={permissoes} />
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold">Planos disponíveis</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pague por Pix e o plano é atualizado na hora.</p>
      </div>

      <Carrossel
        rotulo="Planos disponíveis"
        indiceInicial={Math.max(0, dados.planos.findIndex((p) => p.ehAtual))}
      >
        {dados.planos.map((plano) => (
          <PlanoCard
            key={plano.chave}
            plano={plano}
            situacao={plano.ehAtual ? resumo : undefined}
            ocupado={criar.isPending}
            linkSuporte={linkSuporteDoPlano(plano)}
            onEscolher={(escolhido) => iniciar(pedidoDoPlano(escolhido))}
          />
        ))}
      </Carrossel>

      <PixDialog
        aberto={pagamentoAberto}
        resumo={pedido?.resumo ?? null}
        cobranca={cobranca}
        gerando={criar.isPending || pedindoDocumento}
        erro={criar.isError && !pedindoDocumento ? criar.error.message : null}
        onFechar={cancelarPedido}
        onGerarNovo={gerarNovo}
      />
      <DocumentoDialog
        aberto={pedindoDocumento}
        onFechar={cancelarPedido}
        onSalvo={() => {
          setPedindoDocumento(false);
          if (pedido) iniciar(pedido);
        }}
      />
    </div>
  );
}
