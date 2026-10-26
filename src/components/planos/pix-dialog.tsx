"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, CircleAlert, Copy, Loader2, RefreshCw, TimerOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCobranca } from "@/hooks/use-cobranca";
import { formatarReais } from "@/lib/formatar";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";
import { VALIDADE_DO_PIX_MINUTOS } from "@/lib/pagamentos/validade-do-pix";

export interface ResumoDoPedido {
  planoNome: string;
  periodicidade: string;
  tipoRotulo: string;
  valorCentavos: number;
  limites: string[];
  nota: string;
}

interface PixDialogProps {
  aberto: boolean;
  resumo: ResumoDoPedido | null;
  cobranca: CobrancaResponse | null;
  gerando: boolean;
  erro: string | null;
  onFechar: () => void;
  onGerarNovo: () => void;
}

const relogioEmSegundos = () => Math.floor(Date.now() / 1000) * 1000;

function formatarContagem(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutos = String(Math.floor(total / 60)).padStart(2, "0");
  const segundos = String(total % 60).padStart(2, "0");
  return `${minutos}:${segundos}`;
}

export function PixDialog({ aberto, resumo, cobranca, gerando, erro, onFechar, onGerarNovo }: PixDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useCobranca(cobranca?.id ?? null, cobranca ?? undefined, aberto);
  const atual = data ?? cobranca;
  const paga = atual?.status === "paga";
  const [copiado, setCopiado] = useState(false);

  const expiraEm = atual?.pix?.expiraEm ? new Date(atual.pix.expiraEm).getTime() : null;
  const contando = aberto && atual?.status === "pendente" && expiraEm !== null;

  const subscribe = useCallback(
    (avisar: () => void) => {
      if (!contando) return () => undefined;
      const id = setInterval(avisar, 1000);
      return () => clearInterval(id);
    },
    [contando],
  );
  // useSyncExternalStore lê o relógio a cada renderização: o primeiro frame após abrir já sai certo.
  const agora = useSyncExternalStore(subscribe, relogioEmSegundos, () => 0);

  const restanteMs = expiraEm === null ? null : expiraEm - agora;
  const expirou = atual?.status === "pendente" && restanteMs !== null && restanteMs <= 0;

  useEffect(() => {
    if (!paga) return;
    queryClient.invalidateQueries({ queryKey: ["permissoes"] });
    router.refresh();
  }, [paga, queryClient, router]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o código continua selecionável no campo.
    }
  }

  const indisponivel = !!atual && !paga && (expirou || atual.status !== "pendente");
  const semPix = atual?.status === "pendente" && !atual.pix && !expirou;

  return (
    <Dialog open={aberto} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Finalizar pagamento</DialogTitle>
          <DialogDescription>Pague por Pix e o plano é atualizado na hora.</DialogDescription>
        </DialogHeader>

        {resumo && (
          <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
            <section aria-label="Resumo do pedido" className="grid content-start gap-4 rounded-lg bg-muted/50 p-5">
              <h3 className="text-sm font-semibold text-muted-foreground">Resumo do pedido</h3>
              <dl className="grid gap-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Plano</dt>
                  <dd className="font-medium">{resumo.planoNome}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Periodicidade</dt>
                  <dd className="font-medium capitalize">{resumo.periodicidade}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd className="font-medium">{resumo.tipoRotulo}</dd>
                </div>
              </dl>
              <div className="flex items-baseline justify-between border-t pt-4">
                <span className="text-sm text-muted-foreground">Total hoje</span>
                <span className="text-2xl font-semibold">{formatarReais(resumo.valorCentavos)}</span>
              </div>
              <ul className="grid gap-1.5 border-t pt-4 text-sm">
                {resumo.limites.map((limite) => (
                  <li key={limite} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    {limite}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{resumo.nota}</p>
            </section>

            <section aria-label="Pagamento por Pix" aria-live="polite" className="grid content-center gap-4">
              {paga && (
                <div className="grid justify-items-center gap-3 py-6 text-center">
                  <CheckCircle2 className="size-14 text-emerald-600" />
                  <p className="text-lg font-medium">Pagamento confirmado!</p>
                  <p className="text-sm text-muted-foreground">Seu plano já está atualizado.</p>
                  <Button onClick={onFechar}>Fechar</Button>
                </div>
              )}

              {!cobranca && gerando && (
                <div className="grid justify-items-center gap-4 py-6 text-center">
                  <div className="grid size-56 place-items-center rounded-md border bg-muted/40">
                    <Loader2 className="size-8 animate-spin text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Gerando seu Pix…</p>
                </div>
              )}

              {!cobranca && !gerando && erro && (
                <div className="grid justify-items-center gap-3 py-6 text-center text-sm">
                  <CircleAlert className="size-10 text-destructive" />
                  <p className="text-destructive">{erro}</p>
                  <Button onClick={onGerarNovo}>Tentar de novo</Button>
                </div>
              )}

              {atual?.status === "pendente" && atual.pix && !expirou && (
                <div className="grid gap-4">
                  {/* data: URI do QR devolvido pelo gateway; next/image não otimiza isso. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/png;base64,${atual.pix.qrCodeBase64}`}
                    alt="QR Code do Pix"
                    className="mx-auto size-56 rounded-md border"
                  />
                  <div className="flex gap-2">
                    <Input readOnly value={atual.pix.copiaECola} aria-label="Pix copia e cola" />
                    <Button type="button" variant="outline" onClick={() => copiar(atual.pix!.copiaECola)}>
                      <Copy />
                      {copiado ? "Copiado" : "Copiar"}
                    </Button>
                  </div>
                  <div className="grid gap-1 text-center text-sm text-muted-foreground">
                    {restanteMs !== null && (
                      <p className="font-medium text-foreground">Este Pix expira em {formatarContagem(restanteMs)}</p>
                    )}
                    <p className="flex items-center justify-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Aguardando a confirmação do pagamento…
                    </p>
                  </div>
                </div>
              )}

              {semPix && (
                <div className="grid justify-items-center gap-3 py-6 text-center text-sm">
                  <p>Não conseguimos exibir o Pix desta cobrança.</p>
                  <Button onClick={onGerarNovo}>Gerar novo Pix</Button>
                </div>
              )}

              {indisponivel && (
                <div className="grid justify-items-center gap-4 py-2 text-center">
                  <div className="grid size-56 place-items-center rounded-md border border-dashed bg-muted/40">
                    <TimerOff className="size-12 text-muted-foreground" />
                  </div>
                  <div className="grid gap-1">
                    <p className="text-base font-medium">
                      {expirou || atual?.status === "cancelada" || atual?.status === "vencida"
                        ? "Este Pix expirou"
                        : "Cobrança indisponível"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {expirou || atual?.status === "cancelada" || atual?.status === "vencida"
                        ? `Por segurança, cada Pix vale por ${VALIDADE_DO_PIX_MINUTOS} ${VALIDADE_DO_PIX_MINUTOS === 1 ? "minuto" : "minutos"}. Gere um novo para concluir o pagamento.`
                        : "Esta cobrança não está mais disponível para pagamento."}
                    </p>
                  </div>
                  <Button onClick={onGerarNovo}>
                    <RefreshCw />
                    Gerar novo Pix
                  </Button>
                </div>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
