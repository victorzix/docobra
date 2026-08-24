"use client";

import Link from "next/link";
import { Check, Sparkles } from "lucide-react";
import { motion, type Variants } from "framer-motion";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLANOS = [
  {
    key: "essencial",
    nome: "Essencial",
    descricao: "Pra quem tá começando a validar o fluxo digital.",
    destaque: false,
    itens: [
      "Projetos limitados por mês",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte por email",
    ],
  },
  {
    key: "escritorio",
    nome: "Escritório",
    descricao: "Pra escritórios com volume maior de projetos rodando ao mesmo tempo.",
    destaque: true,
    itens: [
      "Projetos ilimitados",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte prioritário",
    ],
  },
];

const CONTAINER: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.14, delayChildren: 0.05 } },
};

const ITEM: Variants = {
  oculto: { opacity: 0, y: 30, scale: 0.97 },
  visivel: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.55, ease: "easeOut" } },
};

export function Planos() {
  return (
    <section id="planos" className="relative overflow-hidden bg-muted/30 px-6 py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 right-0 size-[34rem] rounded-full bg-cyan-500/10 blur-[130px]"
      />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.div variants={ITEM} className="flex flex-col items-center">
            <span className="bg-gradient-to-r from-cyan-700 via-violet-600 to-fuchsia-700 bg-clip-text font-mono text-xs font-semibold tracking-widest text-transparent uppercase">
              Planos
            </span>
            <span className="marca-gradiente mt-2 h-0.5 w-16 rounded-full" />
          </motion.div>

          <motion.h2
            variants={ITEM}
            className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Um plano pra cada volume de projeto
          </motion.h2>
        </motion.div>

        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER}
          className="mx-auto mt-16 grid max-w-4xl gap-8 sm:grid-cols-2"
        >
          {PLANOS.map((plano) => (
            <motion.div
              key={plano.key}
              variants={ITEM}
              // transition-[translate]: transition-transform incluiria
              // `transform`, que o framer-motion escreve inline a cada frame na
              // entrada, empastelando a animação. O lift só usa `translate`.
              className="group relative h-full transition-[translate] duration-500 hover:-translate-y-2"
            >
              {plano.destaque && (
                <div
                  aria-hidden
                  className="marca-gradiente pointer-events-none absolute -inset-1 rounded-[1.25rem] opacity-45 blur-xl transition-opacity duration-500 group-hover:opacity-80"
                />
              )}

              {/* Borda em gradiente: o wrapper de 2px é a própria borda (com o
                  gradiente de marca no destaque, cinza no outro) e o Card entra
                  sem borda por cima. rounded 16px - 2px = 14px no interno. */}
              <div
                className={`relative h-full rounded-2xl p-[2px] ${
                  plano.destaque
                    ? "marca-gradiente shadow-xl shadow-violet-500/10"
                    : "bg-border shadow-sm transition-shadow duration-500 group-hover:shadow-lg"
                }`}
              >
                {plano.destaque && (
                  <span className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#0a2c4d] px-3 py-1 font-mono text-[0.65rem] font-semibold tracking-widest text-cyan-200 uppercase shadow-lg">
                    <Sparkles className="size-3" />
                    Recomendado
                  </span>
                )}

                <Card className="h-full rounded-[14px] border-0 bg-card shadow-none">
                  <CardHeader>
                    <CardTitle className="text-2xl font-bold">{plano.nome}</CardTitle>
                    <CardDescription className="text-base">{plano.descricao}</CardDescription>
                  </CardHeader>

                  <CardContent>
                    <ul className="flex flex-col gap-4">
                      {plano.itens.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm">
                          <span
                            className={
                              plano.destaque
                                ? "marca-gradiente-escuro mt-px flex size-6 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                                : "mt-px flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-700"
                            }
                          >
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                          <span className="pt-0.5">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>

                  <CardFooter className="mt-auto">
                    <Button
                      asChild
                      size="lg"
                      className={
                        plano.destaque
                          ? "marca-gradiente-escuro h-11 w-full font-semibold text-white shadow-lg shadow-violet-500/25 transition-transform hover:scale-[1.02]"
                          : "h-11 w-full bg-[#0a2c4d] font-semibold text-white transition-transform hover:scale-[1.02] hover:bg-[#0d3a66]"
                      }
                    >
                      <Link href="/register">Começar agora</Link>
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
