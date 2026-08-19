"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Projeto } from "@/db/queries/projeto";
import { criarMemorialSchema } from "@/lib/validations/memorial/create.schema";
import { useCriarMemorial } from "@/hooks/use-criar-memorial";
import { ComboboxCriavel } from "@/components/common/combobox-criavel";
import { ProjetoCombobox } from "@/components/common/projeto-combobox";
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
}

export function NovoMemorialForm({ projetos, onSuccess }: NovoMemorialFormProps) {
  const [modo, setModo] = useState<"texto" | "audio">("texto");
  const [audio, setAudio] = useState<{ base64: string; mimeType: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const criar = useCriarMemorial();
  const { register, handleSubmit, control } = useForm<FormValues>();

  function onInvalid() {
    setErro("Preencha os campos obrigatórios corretamente.");
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
      onError: (error) => setErro(error.message),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="projetoId">Projeto</Label>
        <Controller
          control={control}
          name="projetoId"
          rules={{ required: true }}
          render={({ field }) => (
            <ProjetoCombobox projetos={projetos} value={field.value} onChange={field.onChange} />
          )}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="tipoConstrucao">Tipo de construção</Label>
        <Controller
          control={control}
          name="tipoConstrucao"
          rules={{ required: true }}
          render={({ field }) => (
            <ComboboxCriavel
              opcoes={TIPOS_CONSTRUCAO_SUGERIDOS}
              value={field.value}
              onChange={field.onChange}
              placeholder="Selecione ou digite o tipo..."
              buscaPlaceholder="Buscar ou digitar..."
            />
          )}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
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
          <GravadorAudio onGravado={(base64, mimeType) => setAudio({ base64, mimeType })} />
        )}
      </div>

      {erro && <p className="text-destructive text-sm">{erro}</p>}
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Gerando..." : "Gerar memorial"}
      </Button>
    </form>
  );
}
