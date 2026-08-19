"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

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

interface ProjetoComboboxOption {
  id: string;
  nome: string;
}

interface ProjetoComboboxProps {
  projetos: ProjetoComboboxOption[];
  value?: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function ProjetoCombobox({
  projetos,
  value,
  onChange,
  placeholder = "Selecione um projeto...",
}: ProjetoComboboxProps) {
  const [open, setOpen] = useState(false);
  const selecionado = projetos.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selecionado && "text-muted-foreground")}>
            {selecionado ? selecionado.nome : placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar projeto..." />
          <CommandList>
            <CommandEmpty>Nenhum projeto encontrado.</CommandEmpty>
            <CommandGroup>
              {projetos.map((projeto) => (
                <CommandItem
                  key={projeto.id}
                  value={projeto.id}
                  keywords={[projeto.nome]}
                  onSelect={() => {
                    onChange(projeto.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", projeto.id === value ? "opacity-100" : "opacity-0")} />
                  {projeto.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
