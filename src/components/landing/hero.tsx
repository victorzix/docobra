"use client";

import Link from "next/link";
import { motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { ScrollScene } from "./scroll-scene";

export function Hero() {
  return (
    <section className="relative min-h-[220vh] overflow-hidden bg-[#0a2c4d]">
      <div className="absolute inset-0 -z-0 opacity-80">
        <ScrollScene />
      </div>
      <div className="sticky top-0 h-screen bg-gradient-to-b from-[#0a2c4d]/40 via-[#0a2c4d]/70 to-[#0a2c4d]" />

      <div className="sticky top-0 z-10 flex h-screen items-center justify-center">
        <div className="mx-auto max-w-3xl px-6 text-center">
        <motion.span
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="font-mono text-xs font-medium tracking-widest text-cyan-400 uppercase"
        >
          Documentação técnica para engenharia e arquitetura
        </motion.span>

        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          Documentação técnica sem perder o dia inteiro nela.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-5 text-lg text-slate-300"
        >
          Gere Memorial Descritivo em ABNT a partir de um formulário curto e
          traduza as exigências do Comunique-se da prefeitura em um checklist
          simples — os dois em minutos, não em horas.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-8"
        >
          <Button
            asChild
            size="lg"
            className="bg-cyan-600 text-white shadow-lg shadow-cyan-900/30 hover:bg-cyan-500"
          >
            <Link href="/register">Comece agora</Link>
          </Button>
        </motion.div>
        </div>
      </div>
    </section>
  );
}
