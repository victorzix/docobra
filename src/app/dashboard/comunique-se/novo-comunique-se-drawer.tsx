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
import { NovoComuniqueSeForm } from "./novo-comunique-se-form";

interface NovoComuniqueSeDrawerProps {
  projetos: Projeto[];
}

export function NovoComuniqueSeDrawer({ projetos }: NovoComuniqueSeDrawerProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  function handleSuccess() {
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["comunique-se"] });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button>Novo Comunique-se</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo Comunique-se</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <NovoComuniqueSeForm projetos={projetos} onSuccess={handleSuccess} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
