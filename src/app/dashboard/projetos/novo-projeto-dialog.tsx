"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";

import {
  criarProjetoSchema,
  type CriarProjetoInput,
} from "@/lib/validations/projeto/create.schema";
import { useCriarProjeto } from "@/hooks/use-criar-projeto";
import { usePermissaoDeUso } from "@/hooks/use-permissoes";
import type { PermissoesDaEmpresa } from "@/lib/permissoes/permissoes-da-empresa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

interface NovoProjetoDialogProps {
  permissoesIniciais?: PermissoesDaEmpresa;
}

export function NovoProjetoDialog({ permissoesIniciais }: NovoProjetoDialogProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const criar = useCriarProjeto();
  const permissao = usePermissaoDeUso("projetos.criar", permissoesIniciais);

  const form = useForm<CriarProjetoInput>({
    resolver: zodResolver(criarProjetoSchema),
    defaultValues: { nome: "", endereco: "" },
  });

  function onSubmit(values: CriarProjetoInput) {
    criar.mutate(values, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: ["projetos"] });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={permissao ? !permissao.permitido : false}>Novo projeto</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo projeto</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endereco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {criar.isError && (
              <p className="text-destructive text-sm">{criar.error.message}</p>
            )}
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Criando..." : "Criar projeto"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
