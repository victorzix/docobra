"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  function handleSuccess() {
    setOpen(false);
    router.refresh();
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button>Novo memorial</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo memorial descritivo</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <NovoMemorialForm projetos={projetos} onSuccess={handleSuccess} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
