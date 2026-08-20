"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Projeto } from "@/db/queries/projeto";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import { useCriarComuniqueSe } from "@/hooks/use-criar-comunique-se";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;

interface FormValues {
  projetoId: string;
}

interface NovoComuniqueSeFormProps {
  projetos: Projeto[];
  onSuccess: () => void;
}

function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function NovoComuniqueSeForm({ projetos, onSuccess }: NovoComuniqueSeFormProps) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarComuniqueSe();
  const { handleSubmit, control } = useForm<FormValues>();

  function handleArquivoSelecionado(event: React.ChangeEvent<HTMLInputElement>) {
    const selecionado = event.target.files?.[0] ?? null;
    setErro(null);

    if (!selecionado) {
      setArquivo(null);
      return;
    }
    if (selecionado.type !== "application/pdf") {
      setErro("Selecione um arquivo PDF.");
      setArquivo(null);
      return;
    }
    if (selecionado.size > TAMANHO_MAXIMO_PDF_BYTES) {
      setErro("O arquivo excede o tamanho máximo de 10MB.");
      setArquivo(null);
      return;
    }

    setArquivo(selecionado);
  }

  async function onSubmit(values: FormValues) {
    setErro(null);

    if (!arquivo) {
      setErro("Selecione um arquivo PDF.");
      return;
    }

    const pdfBase64 = arrayBufferParaBase64(await arquivo.arrayBuffer());
    const payload = { projetoId: values.projetoId, pdfBase64 };

    const parsed = criarComuniqueSeSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Preencha os campos obrigatórios corretamente.");
      return;
    }

    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => setErro(error.message),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="relative grid gap-6">
      {criar.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95">
          <LoadingSpinner label="Processando" />
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="projetoId">Projeto</Label>
        <Controller
          control={control}
          name="projetoId"
          rules={{ required: "Selecione um projeto." }}
          render={({ field, fieldState }) => (
            <>
              <ProjetoCombobox projetos={projetos} value={field.value} onChange={field.onChange} />
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pdf">Arquivo do Comunique-se (PDF)</Label>
        <input
          id="pdf"
          type="file"
          accept="application/pdf"
          onChange={handleArquivoSelecionado}
          className="rounded-md border border-input p-2 text-sm"
        />
        {arquivo && <p className="text-xs text-muted-foreground">{arquivo.name}</p>}
      </div>

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Processando..." : "Enviar Comunique-se"}
      </Button>
    </form>
  );
}
