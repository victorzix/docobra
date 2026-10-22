"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Projeto } from "@/db/queries/projeto";
import { usePermissaoDeUso } from "@/hooks/use-permissoes";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { NovoMemorialForm } from "./novo-memorial-form";

interface NovoMemorialDrawerProps {
  projetos: Projeto[];
  permissoesIniciais?: PermissoesDaEmpresa;
}

export function NovoMemorialDrawer({ projetos, permissoesIniciais }: NovoMemorialDrawerProps) {
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();
  const gerar = usePermissaoDeUso("memorial.gerar", permissoesIniciais);
  const audio = usePermissaoDeUso("memorial.audio", permissoesIniciais);

  function handleSuccess() {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["memoriais"] });
  }

  function handleOpenChange(proximoOpen: boolean) {
    if (!proximoOpen && enviando) return;
    setOpen(proximoOpen);
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange} dismissible={!enviando}>
      <DrawerTrigger asChild>
        <Button disabled={gerar ? !gerar.permitido : false}>Novo memorial</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo memorial descritivo</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <NovoMemorialForm
            projetos={projetos}
            onSuccess={handleSuccess}
            onPendingChange={setEnviando}
            audioPermitido={audio ? audio.permitido : true}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
