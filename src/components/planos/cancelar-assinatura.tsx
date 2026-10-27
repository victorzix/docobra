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
      <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={() => {
          cancelar.reset();
          setAberto(true);
        }}
      >
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
