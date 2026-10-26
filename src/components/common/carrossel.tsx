"use client";

import { Children, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface CarrosselProps {
  children: React.ReactNode;
  indiceInicial?: number;
  rotulo: string;
}

export function Carrossel({ children, indiceInicial = 0, rotulo }: CarrosselProps) {
  const trilho = useRef<HTMLDivElement>(null);
  const itens = Children.toArray(children);
  const [indice, setIndice] = useState(indiceInicial);
  const [rolavel, setRolavel] = useState(false);

  const posicaoDoItem = useCallback((i: number) => {
    const el = trilho.current;
    const item = el?.children[i] as HTMLElement | undefined;
    if (!el || !item) return 0;
    return item.offsetLeft - (el.clientWidth - item.clientWidth) / 2;
  }, []);

  const ir = useCallback(
    (i: number, suave = true) => {
      trilho.current?.scrollTo({ left: posicaoDoItem(i), behavior: suave ? "smooth" : "auto" });
    },
    [posicaoDoItem],
  );

  function aoRolar() {
    const el = trilho.current;
    if (!el) return;
    const centro = el.scrollLeft + el.clientWidth / 2;
    let maisPerto = 0;
    let menorDistancia = Infinity;
    Array.from(el.children).forEach((filho, i) => {
      const item = filho as HTMLElement;
      const distancia = Math.abs(item.offsetLeft + item.clientWidth / 2 - centro);
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        maisPerto = i;
      }
    });
    setIndice(maisPerto);
  }

  useEffect(() => {
    const el = trilho.current;
    if (!el) return;
    ir(indiceInicial, false);
    const medir = () => setRolavel(el.scrollWidth > el.clientWidth + 1);
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [ir, indiceInicial]);

  return (
    <div className="grid gap-4" role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <div
        ref={trilho}
        onScroll={aoRolar}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {itens.map((item, i) => (
          <div key={i} className="flex w-[min(22rem,82vw)] shrink-0 snap-center *:w-full">
            {item}
          </div>
        ))}
      </div>

      {rolavel && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Plano anterior"
            disabled={indice === 0}
            onClick={() => ir(indice - 1)}
          >
            <ChevronLeft />
          </Button>
          <div className="flex gap-1.5">
            {itens.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para o plano ${i + 1}`}
                aria-current={i === indice}
                onClick={() => ir(i)}
                className={`h-2 rounded-full transition-all ${i === indice ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30"}`}
              />
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label="Próximo plano"
            disabled={indice === itens.length - 1}
            onClick={() => ir(indice + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}
