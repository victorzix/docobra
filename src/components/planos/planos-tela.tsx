"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CircleAlert } from "lucide-react";

import { DocumentoDialog } from "@/components/planos/documento-dialog";
import { PixDialog } from "@/components/planos/pix-dialog";
import { PlanoCard } from "@/components/planos/plano-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CobrancaError, useCriarCobranca } from "@/hooks/use-criar-cobranca";
import type { PlanoDaTela, TelaDePlanos } from "@/lib/planos/carregar-tela-de-planos";
import { descreverAssinatura } from "@/lib/planos/descrever-assinatura";
import type { ContatoSuporte } from "@/lib/permissoes/contexto-de-planos";
import { montarMailtoSuporte } from "@/lib/permissoes/descrever-uso";
import type { CriarCobrancaInput } from "@/lib/validations/cobranca/create.schema";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

interface PlanosTelaProps {
  dados: TelaDePlanos;
  contatoSuporte: ContatoSuporte;
}

interface Pedido {
  titulo: string;
  input: CriarCobrancaInput;
}

const COR_DO_TOM = {
  normal: "text-foreground",
  alerta: "text-amber-600",
  erro: "text-destructive",
} as const;

function pedidoDoPlano(plano: PlanoDaTela): Pedido {
  if (plano.acao === "renovar") return { titulo: `Renovação — ${plano.nome}`, input: { tipo: "renovacao" } };
  if (plano.acao === "upgrade") {
    return { titulo: `Upgrade para ${plano.nome}`, input: { tipo: "upgrade", planoChave: plano.chave } };
  }
  return { titulo: `Assinatura — ${plano.nome}`, input: { tipo: "assinatura", planoChave: plano.chave } };
}

export function PlanosTela({ dados, contatoSuporte }: PlanosTelaProps) {
  const router = useRouter();
  const criar = useCriarCobranca();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [cobranca, setCobranca] = useState<CobrancaResponse | null>(null);
  const [pedindoDocumento, setPedindoDocumento] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const resumo = descreverAssinatura(dados.assinatura);

  function iniciar(novo: Pedido) {
    if (criar.isPending) return;
    setPedido(novo);
    setAviso(null);
    criar.mutate(novo.input, {
      onSuccess: (criada) => {
        setPedindoDocumento(false);
        setCobranca(criada);
      },
      onError: (erro) => {
        const codigo = erro instanceof CobrancaError ? erro.codigo : undefined;
        if (codigo === "DOCUMENTO_AUSENTE") {
          setPedindoDocumento(true);
          return;
        }
        setAviso(erro.message);
        // O estado da assinatura mudou desde que a página foi carregada: recarrega os cards.
        if (codigo === "COBRANCA_NAO_PERMITIDA") router.refresh();
      },
    });
  }

  function gerarNovo() {
    setCobranca(null);
    if (pedido) iniciar(pedido);
  }

  function linkSuporteDoPlano(plano: PlanoDaTela): string | null {
    if (!contatoSuporte.email) return null;
    return montarMailtoSuporte({
      email: contatoSuporte.email,
      empresaNome: contatoSuporte.empresaNome,
      planoChave: contatoSuporte.planoChave,
      motivo: `Quero trocar para o plano ${plano.nome}`,
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Planos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pague por Pix e o plano é atualizado na hora.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className={COR_DO_TOM[resumo.tom]}>{resumo.titulo}</CardTitle>
          <CardDescription>{resumo.detalhe}</CardDescription>
        </CardHeader>
      </Card>

      {aviso && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      <motion.div
        initial="oculto"
        animate="visivel"
        variants={{ oculto: {}, visivel: { transition: { staggerChildren: 0.08 } } }}
        className="grid gap-6 sm:grid-cols-2"
      >
        {dados.planos.map((plano) => (
          <motion.div
            key={plano.chave}
            variants={{ oculto: { opacity: 0, y: 12 }, visivel: { opacity: 1, y: 0 } }}
            className="flex *:w-full"
          >
            <PlanoCard
              plano={plano}
              ocupado={criar.isPending}
              linkSuporte={linkSuporteDoPlano(plano)}
              onEscolher={(escolhido) => iniciar(pedidoDoPlano(escolhido))}
            />
          </motion.div>
        ))}
      </motion.div>

      {contatoSuporte.email && (
        <p className="text-sm text-muted-foreground">
          Precisa reduzir o plano ou trocar entre mensal e anual?{" "}
          <a
            className="font-medium text-primary hover:underline"
            href={montarMailtoSuporte({
              email: contatoSuporte.email,
              empresaNome: contatoSuporte.empresaNome,
              planoChave: contatoSuporte.planoChave,
              motivo: "Quero reduzir o plano ou trocar a periodicidade",
            })}
          >
            Fale com o suporte
          </a>
          .
        </p>
      )}

      <PixDialog
        cobranca={cobranca}
        titulo={pedido?.titulo ?? "Pagamento"}
        onFechar={() => setCobranca(null)}
        onGerarNovo={gerarNovo}
      />
      <DocumentoDialog
        aberto={pedindoDocumento}
        onFechar={() => setPedindoDocumento(false)}
        onSalvo={() => {
          setPedindoDocumento(false);
          if (pedido) iniciar(pedido);
        }}
      />
    </div>
  );
}
