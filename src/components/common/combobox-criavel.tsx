"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ComboboxCriavelProps {
  opcoes: string[];
  value?: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  buscaPlaceholder?: string;
}

export function ComboboxCriavel({
  opcoes,
  value,
  onChange,
  placeholder = "Selecione ou digite...",
  buscaPlaceholder = "Buscar ou digitar...",
}: ComboboxCriavelProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const buscaNormalizada = busca.trim().toLowerCase();
  const opcoesFiltradas = opcoes.filter((opcao) => opcao.toLowerCase().includes(buscaNormalizada));
  const jaExiste = opcoes.some((opcao) => opcao.toLowerCase() === buscaNormalizada);
  const podeCriar = busca.trim().length > 0 && !jaExiste;

  function selecionar(valor: string) {
    onChange(valor);
    setBusca("");
    setOpen(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(novoAberto) => {
        setOpen(novoAberto);
        if (!novoAberto) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={buscaPlaceholder} value={busca} onValueChange={setBusca} />
          <CommandList>
            {opcoesFiltradas.length === 0 && !podeCriar && (
              <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            )}
            <CommandGroup>
              {opcoesFiltradas.map((opcao) => (
                <CommandItem key={opcao} value={opcao} onSelect={() => selecionar(opcao)}>
                  <Check className={cn("size-4", opcao === value ? "opacity-100" : "opacity-0")} />
                  {opcao}
                </CommandItem>
              ))}
              {podeCriar && (
                <CommandItem
                  value={`__criar__${busca}`}
                  onSelect={() => selecionar(busca.trim())}
                  className="text-primary"
                >
                  <Plus className="size-4" />
                  Usar &quot;{busca.trim()}&quot;
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
