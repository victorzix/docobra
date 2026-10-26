"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCobranca } from "@/hooks/use-cobranca";
import { formatarData, formatarReais } from "@/lib/formatar";
import type { CobrancaResponse } from "@/lib/validations/cobranca/response.schema";

interface PixDialogProps {
  cobranca: CobrancaResponse | null;
  titulo: string;
  onFechar: () => void;
  onGerarNovo: () => void;
}

export function PixDialog({ cobranca, titulo, onFechar, onGerarNovo }: PixDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data } = useCobranca(cobranca?.id ?? null, cobranca ?? undefined);
  const atual = data ?? cobranca;
  const paga = atual?.status === "paga";
  const [copiado, setCopiado] = useState(false);

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

  return (
    <Dialog open={cobranca !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {atual ? `${formatarReais(atual.valorCentavos)} · pague até ${formatarData(atual.venceEm)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {atual?.status === "pendente" && atual.pix && (
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
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Aguardando a confirmação do pagamento…
            </p>
          </div>
        )}

        {atual?.status === "pendente" && !atual.pix && (
          <div className="grid gap-3 text-sm">
            <p>Não conseguimos exibir o Pix desta cobrança.</p>
            <Button onClick={onGerarNovo}>Gerar novo Pix</Button>
          </div>
        )}

        {paga && (
          <div className="grid justify-items-center gap-3 py-2 text-center">
            <CheckCircle2 className="size-12 text-emerald-600" />
            <p className="font-medium">Pagamento confirmado!</p>
            <p className="text-sm text-muted-foreground">Seu plano já está atualizado.</p>
            <Button onClick={onFechar}>Fechar</Button>
          </div>
        )}

        {atual && atual.status !== "pendente" && !paga && (
          <div className="grid gap-3 text-sm">
            <p>Esta cobrança não está mais disponível para pagamento.</p>
            <Button onClick={onGerarNovo}>Gerar novo Pix</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
