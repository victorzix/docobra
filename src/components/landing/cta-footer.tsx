"use client";

import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

const CONTAINER: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.15, delayChildren: 0.05 } },
};

const ITEM: Variants = {
  oculto: { opacity: 0, y: 28, scale: 0.97 },
  visivel: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: "easeOut" } },
};

export function CtaFooter() {
  const ano = new Date().getFullYear();

  return (
    <>
      <section className="relative overflow-hidden bg-[#0a2c4d] px-6 py-28 text-center">
        {/* Mesh de blobs animados por cima do navy. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -top-40 left-1/4 size-[36rem] rounded-full bg-violet-600/35 blur-[120px]"
            animate={{ x: [0, 90, 0], y: [0, 60, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 19, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -bottom-40 right-1/4 size-[32rem] rounded-full bg-cyan-500/30 blur-[120px]"
            animate={{ x: [0, -80, 0], y: [0, -50, 0], scale: [1, 1.2, 1] }}
            transition={{ duration: 23, repeat: Infinity, ease: "easeInOut", delay: 2 }}
          />
          <motion.div
            className="absolute top-1/3 right-0 size-[28rem] rounded-full bg-fuchsia-500/30 blur-[130px]"
            animate={{ x: [0, -60, 0], y: [0, 70, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 21, repeat: Infinity, ease: "easeInOut", delay: 4 }}
          />
          {/* Véu escuro pra garantir contraste do texto branco por cima do mesh. */}
          <div className="absolute inset-0 bg-[#0a2c4d]/45" />
        </div>

        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER}
          className="relative z-10 mx-auto max-w-3xl"
        >
          <motion.h2
            variants={ITEM}
            className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Pronto pra parar de perder tempo com{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              documentação
            </span>
            ?
          </motion.h2>

          <motion.p variants={ITEM} className="mx-auto mt-6 max-w-xl text-lg text-slate-300">
            Crie sua conta e gere seu primeiro Memorial Descritivo ainda hoje.
          </motion.p>

          <motion.div variants={ITEM}>
            <Button
              asChild
              size="lg"
              className="marca-gradiente group mt-10 h-13 px-9 text-base font-semibold text-white shadow-[0_12px_44px_-8px_rgba(139,92,246,0.75)] transition-transform hover:scale-105"
            >
              <Link href="/register">
                Comece agora
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
            </Button>
          </motion.div>
        </motion.div>
      </section>

      <footer className="relative bg-[#081f38] px-6 py-10">
        {/* Fio de luz no lugar do border-t chapado. */}
        <div aria-hidden className="marca-gradiente absolute inset-x-0 top-0 h-px opacity-50" />

        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-slate-400 sm:flex-row">
          <span className="flex items-center gap-2">
            <span className="marca-gradiente size-2 rounded-full" />© {ano} DocObra.
          </span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="transition-colors hover:text-cyan-300">
              Entrar
            </Link>
            <Link href="/register" className="transition-colors hover:text-fuchsia-300">
              Cadastre-se
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
