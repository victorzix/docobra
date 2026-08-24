"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm, type FieldErrors } from "react-hook-form";

import type { Projeto } from "@/db/queries/projeto";
import { CriacaoParcialError } from "@/lib/erros/criacao-parcial";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import { useCriarMemorial } from "@/hooks/use-criar-memorial";
import { ComboboxCriavel } from "@/components/common/combobox-criavel";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
import { LoadingSpinner } from "@/components/common/loading-spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GravadorAudio } from "./gravador-audio";

const TIPOS_CONSTRUCAO_SUGERIDOS = [
  "Residencial unifamiliar",
  "Residencial multifamiliar",
  "Comercial",
  "Industrial",
  "Institucional",
  "Misto (comercial e residencial)",
  "Reforma",
  "Ampliação",
];

const TOPICOS_ESPECIFICACOES = [
  "Fundação e estrutura",
  "Alvenaria e cobertura",
  "Instalações elétrica e hidráulica",
  "Acabamentos",
];

interface FormValues {
  projetoId: string;
  tipoConstrucao: string;
  numeroPavimentos: string;
  areaConstruida: string;
  areaTerreno: string;
  fundacaoEstrutura: string;
  alvenariaCobertura: string;
  instalacoes: string;
  acabamentos: string;
}

interface NovoMemorialFormProps {
  projetos: Projeto[];
  onSuccess: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export function NovoMemorialForm({ projetos, onSuccess, onPendingChange }: NovoMemorialFormProps) {
  const [modo, setModo] = useState<"texto" | "audio">("texto");
  const [audio, setAudio] = useState<{ base64: string; mimeType: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarMemorial();
  const { register, handleSubmit, control } = useForm<FormValues>();
  const erroRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (erro) {
      erroRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [erro]);

  useEffect(() => {
    onPendingChange?.(criar.isPending);
  }, [criar.isPending, onPendingChange]);

  function onInvalid(errors: FieldErrors<FormValues>) {
    const idDoPrimeiroCampo = errors.projetoId
      ? "campo-projetoId"
      : errors.tipoConstrucao
        ? "campo-tipoConstrucao"
        : null;

    document.getElementById(idDoPrimeiroCampo ?? "")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onSubmit(values: FormValues) {
    setErro(null);

    const base = {
      projetoId: values.projetoId,
      tipoConstrucao: values.tipoConstrucao,
      numeroPavimentos: values.numeroPavimentos ? Number(values.numeroPavimentos) : undefined,
      areaConstruida: values.areaConstruida ? Number(values.areaConstruida) : undefined,
      areaTerreno: values.areaTerreno ? Number(values.areaTerreno) : undefined,
    };

    const payload =
      modo === "texto"
        ? {
            ...base,
            modoEspecificacoes: "texto" as const,
            especificacoes: {
              fundacaoEstrutura: values.fundacaoEstrutura || undefined,
              alvenariaCobertura: values.alvenariaCobertura || undefined,
              instalacoes: values.instalacoes || undefined,
              acabamentos: values.acabamentos || undefined,
            },
          }
        : {
            ...base,
            modoEspecificacoes: "audio" as const,
            audioBase64: audio?.base64 ?? "",
            audioMimeType: audio?.mimeType ?? "",
          };

    const parsed = criarMemorialSchema.safeParse(payload);
    if (!parsed.success) {
      setErro("Preencha os campos obrigatórios corretamente.");
      return;
    }

    criar.mutate(parsed.data, {
      onSuccess: () => onSuccess(),
      onError: (error) => {
        if (error instanceof CriacaoParcialError) {
          onSuccess();
          return;
        }
        setErro(error.message);
      },
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="relative grid gap-6">
      {criar.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/95">
          <LoadingSpinner label="Gerando memorial" />
        </div>
      )}

      <div id="campo-projetoId" className="grid gap-2">
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

      <div id="campo-tipoConstrucao" className="grid gap-2">
        <Label htmlFor="tipoConstrucao">Tipo de construção</Label>
        <Controller
          control={control}
          name="tipoConstrucao"
          rules={{ required: "Informe o tipo de construção." }}
          render={({ field, fieldState }) => (
            <>
              <ComboboxCriavel
                opcoes={TIPOS_CONSTRUCAO_SUGERIDOS}
                value={field.value}
                onChange={field.onChange}
                placeholder="Selecione ou digite o tipo..."
                buscaPlaceholder="Buscar ou digitar..."
              />
              {fieldState.error && <p className="text-xs text-destructive">{fieldState.error.message}</p>}
            </>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="numeroPavimentos">Nº de pavimentos</Label>
          <Input id="numeroPavimentos" type="number" {...register("numeroPavimentos")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="areaConstruida">Área construída (m²)</Label>
          <Input id="areaConstruida" type="number" {...register("areaConstruida")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="areaTerreno">Área do terreno (m²)</Label>
          <Input id="areaTerreno" type="number" {...register("areaTerreno")} />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Especificações técnicas</Label>
        <div className="flex gap-2">
          <Button type="button" variant={modo === "texto" ? "default" : "outline"} onClick={() => setModo("texto")}>
            Digitar
          </Button>
          <Button type="button" variant={modo === "audio" ? "default" : "outline"} onClick={() => setModo("audio")}>
            Gravar áudio
          </Button>
        </div>

        {modo === "texto" ? (
          <div className="grid gap-4">
            <Textarea placeholder="Fundação e estrutura" {...register("fundacaoEstrutura")} />
            <Textarea placeholder="Alvenaria e cobertura" {...register("alvenariaCobertura")} />
            <Textarea placeholder="Instalações elétrica e hidráulica" {...register("instalacoes")} />
            <Textarea placeholder="Acabamentos" {...register("acabamentos")} />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Cubra esses tópicos na gravação:
              </p>
              <ul className="grid list-inside list-disc gap-1 text-sm marker:text-primary">
                {TOPICOS_ESPECIFICACOES.map((topico) => (
                  <li key={topico}>{topico}</li>
                ))}
              </ul>
            </div>
            <GravadorAudio onGravado={(base64, mimeType) => setAudio({ base64, mimeType })} />
          </div>
        )}
      </div>

      {erro && (
        <p ref={erroRef} className="text-destructive text-sm">
          {erro}
        </p>
      )}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Gerando..." : "Gerar memorial"}
      </Button>
    </form>
  );
}
