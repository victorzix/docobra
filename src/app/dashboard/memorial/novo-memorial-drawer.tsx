"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Projeto } from "@/db/queries/projeto";
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
}

export function NovoMemorialDrawer({ projetos }: NovoMemorialDrawerProps) {
  const [open, setOpen] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const queryClient = useQueryClient();

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
        <Button>Novo memorial</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo memorial descritivo</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <NovoMemorialForm projetos={projetos} onSuccess={handleSuccess} onPendingChange={setEnviando} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
