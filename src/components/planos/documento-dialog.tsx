"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useSalvarDocumento } from "@/hooks/use-salvar-documento";
import { mascararDocumento } from "@/lib/pagamentos/documento";
import { atualizarDocumentoSchema, type AtualizarDocumentoInput } from "@/lib/validations/empresa/documento.schema";

interface DocumentoDialogProps {
  aberto: boolean;
  onSalvo: () => void;
  onFechar: () => void;
}

export function DocumentoDialog({ aberto, onSalvo, onFechar }: DocumentoDialogProps) {
  const salvar = useSalvarDocumento();
  const form = useForm<AtualizarDocumentoInput>({
    resolver: zodResolver(atualizarDocumentoSchema),
    defaultValues: { documento: "" },
  });

  function onSubmit(valores: AtualizarDocumentoInput) {
    salvar.mutate(valores, { onSuccess: onSalvo });
  }

  return (
    <Dialog open={aberto} onOpenChange={(abrir) => !abrir && onFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>CPF ou CNPJ da empresa</DialogTitle>
          <DialogDescription>O provedor de pagamento exige o documento para emitir o Pix.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Documento</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      inputMode="numeric"
                      placeholder="00.000.000/0000-00"
                      {...field}
                      onChange={(evento) => field.onChange(mascararDocumento(evento.target.value))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {salvar.isError && <p className="text-sm text-destructive">{salvar.error.message}</p>}
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar e gerar o Pix"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
