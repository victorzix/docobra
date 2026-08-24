"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";

import { arrayBufferParaBase64 } from "@/lib/browser/arraybuffer-para-base64";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
import type { Projeto } from "@/db/queries/projeto";
import { criarComuniqueSeSchema } from "@/lib/validations/comunique-se/create.schema";
import { useCriarComuniqueSe } from "@/hooks/use-criar-comunique-se";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TAMANHO_MAXIMO_PDF_BYTES = 10 * 1024 * 1024;

interface FormValues {
  projetoId: string;
}

interface NovoComuniqueSeFormProps {
  projetos: Projeto[];
  onSuccess: () => void;
}

export function NovoComuniqueSeForm({ projetos, onSuccess }: NovoComuniqueSeFormProps) {
  const [modo, setModo] = useState<"pdf" | "manual">("pdf");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [itensDigitados, setItensDigitados] = useState<{ id: string; texto: string }[]>([
    { id: crypto.randomUUID(), texto: "" },
  ]);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarComuniqueSe();
  const router = useRouter();
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

  function handleItemDigitadoChange(id: string, valor: string) {
    setItensDigitados((atual) => atual.map((item) => (item.id === id ? { ...item, texto: valor } : item)));
  }

  function handleAdicionarLinha() {
    setItensDigitados((atual) => [...atual, { id: crypto.randomUUID(), texto: "" }]);
  }

  function handleRemoverLinha(id: string) {
    setItensDigitados((atual) => (atual.length === 1 ? atual : atual.filter((item) => item.id !== id)));
  }

  async function onSubmit(values: FormValues) {
    setErro(null);

    if (modo === "pdf") {
      if (!arquivo) {
        setErro("Selecione um arquivo PDF.");
        return;
      }

      const pdfBase64 = await arrayBufferParaBase64(await arquivo.arrayBuffer());
      const payload = { modoCriacao: "pdf" as const, projetoId: values.projetoId, pdfBase64 };

      const parsed = criarComuniqueSeSchema.safeParse(payload);
      if (!parsed.success) {
        setErro("Preencha os campos obrigatórios corretamente.");
        return;
      }

      criar.mutate(parsed.data, {
        onSuccess: () => onSuccess(),
        onError: (error) => {
          if (error instanceof CriacaoParcialError) {
            onSuccess();
            router.push(`/dashboard/comunique-se/${error.id}`);
            return;
          }
          setErro(error.message);
        },
      });
      return;
    }

    const itensPreenchidos = itensDigitados.map((item) => item.texto.trim()).filter((texto) => texto.length > 0);
    const payload = {
      modoCriacao: "manual" as const,
      projetoId: values.projetoId,
      itens: itensPreenchidos.map((descricao) => ({ descricao })),
    };

    const parsed = criarComuniqueSeSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Adicione pelo menos um item.");
      return;
    }

    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => {
        if (error instanceof CriacaoParcialError) {
          onSuccess();
          router.push(`/dashboard/comunique-se/${error.id}`);
          return;
        }
        setErro(error.message);
      },
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
        <Label>Como criar</Label>
        <div className="flex gap-2">
          <Button type="button" variant={modo === "pdf" ? "default" : "outline"} onClick={() => setModo("pdf")}>
            Enviar PDF
          </Button>
          <Button type="button" variant={modo === "manual" ? "default" : "outline"} onClick={() => setModo("manual")}>
            Digitar exigências
          </Button>
        </div>
      </div>

      {modo === "pdf" ? (
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
      ) : (
        <div className="grid gap-2">
          <Label>Exigências</Label>
          <div className="grid gap-2">
            {itensDigitados.map((item) => (
              <div key={item.id} className="flex gap-2">
                <Input
                  value={item.texto}
                  onChange={(event) => handleItemDigitadoChange(item.id, event.target.value)}
                  placeholder="Descreva a exigência"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoverLinha(item.id)}
                  disabled={itensDigitados.length === 1}
                >
                  Remover
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleAdicionarLinha}>
            + Adicionar item
          </Button>
        </div>
      )}

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Processando..." : "Enviar Comunique-se"}
      </Button>
    </form>
  );
}
