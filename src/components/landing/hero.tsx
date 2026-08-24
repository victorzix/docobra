"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollScene } from "./scroll-scene";

export function Hero() {
  return (
    // overflow-clip (e não overflow-hidden) porque hidden cria um scroll
    // container e quebraria o position: sticky dos filhos.
    <section className="relative min-h-[220vh] overflow-clip bg-[#0a2c4d]">
      <div className="absolute inset-0 -z-0 opacity-80">
        <ScrollScene />
      </div>

      <div className="sticky top-0 z-10 flex h-screen w-full items-center justify-center">
        <div className="absolute inset-0 -z-0 bg-gradient-to-b from-[#0a2c4d]/40 via-[#0a2c4d]/70 to-[#0a2c4d]" />

        {/* Blobs de luz. Ficam depois do gradiente no DOM e com o mesmo
            z-index, então pintam por cima dele e por baixo do texto (z-10). */}
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <motion.div
            aria-hidden
            className="absolute -top-24 -left-24 size-[34rem] rounded-full bg-cyan-500/25 blur-[110px]"
            animate={{ x: [0, 70, 0], y: [0, 50, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            aria-hidden
            className="absolute -right-32 top-1/4 size-[30rem] rounded-full bg-fuchsia-500/25 blur-[120px]"
            animate={{ x: [0, -60, 0], y: [0, 70, 0], scale: [1, 1.18, 1] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          />
          <motion.div
            aria-hidden
            className="absolute bottom-0 left-1/3 size-[26rem] rounded-full bg-violet-600/25 blur-[110px]"
            animate={{ x: [0, 50, 0], y: [0, -40, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-400 p-px shadow-[0_0_28px_rgba(139,92,246,0.45)]"
          >
            <span className="rounded-full bg-[#0a2c4d]/85 px-4 py-1.5 font-mono text-[0.65rem] font-medium tracking-widest text-cyan-200 uppercase sm:text-xs">
              Documentação técnica para engenharia e arquitetura
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Documentação técnica{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              sem perder o dia inteiro
            </span>{" "}
            nela.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg text-slate-300"
          >
            Gere Memorial Descritivo em ABNT a partir de um formulário curto e
            traduza as exigências do Comunique-se da prefeitura em um checklist
            simples — os dois em minutos, não em horas.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-10"
          >
            <Button
              asChild
              size="lg"
              className="marca-gradiente group h-12 px-8 text-base font-semibold text-white shadow-[0_10px_40px_-8px_rgba(139,92,246,0.7)] transition-transform hover:scale-105"
            >
              <Link href="/register">
                Comece agora
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
