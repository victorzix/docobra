"use client";

import { motion } from "framer-motion";
import { FileCheck2, ListChecks, Ruler } from "lucide-react";

import { BUILD_END, FloorScene3D as FloorScene } from "./floor-scene-3d";
import { Typewriter } from "./typewriter";

export function Logo({
  className,
  variant = "dark",
}: {
  className?: string;
  variant?: "dark" | "light";
}) {
  return (
    <div className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-cyan-500">
        <Ruler className="size-5 text-[#08243f]" strokeWidth={2.25} />
      </div>
      <span
        className={`text-lg font-semibold tracking-tight ${
          variant === "dark" ? "text-white" : "text-foreground"
        }`}
      >
        DocObra
      </span>
    </div>
  );
}

const NOTES = [
  { text: "ÁREA 18,40 m²", className: "left-3 top-3 -rotate-2", delay: BUILD_END + 0.3 },
  { text: "PILAR 20x20", className: "right-3 top-3 rotate-1", delay: BUILD_END + 0.9 },
  { text: "REV. 02", className: "left-1/2 top-3 -translate-x-1/2 -rotate-1", delay: BUILD_END + 1.5 },
  {
    text: "6,00 × 4,20 = 25,20 m²",
    className: "left-[4%] top-1/2 -translate-y-1/2 -rotate-1",
    delay: BUILD_END + 2.1,
  },
  {
    text: "ESQUADRIA 100x120",
    className: "right-[4%] top-[64%] rotate-2",
    delay: BUILD_END + 2.7,
  },
  { text: "N.A. +2,80", className: "left-3 bottom-3 rotate-2", delay: BUILD_END + 3.3 },
  { text: "CONCRETO fck 25MPa", className: "bottom-3 right-3 rotate-1", delay: BUILD_END + 3.9 },
];

const FEATURES = [
  { icon: FileCheck2, text: "Memorial Descritivo gerado em minutos, formatado em ABNT" },
  { icon: ListChecks, text: "Exigências da prefeitura traduzidas em checklist simples" },
];

function CornerMarks() {
  const base = "absolute size-4 border-cyan-400/30";
  return (
    <>
      <span className={`${base} left-6 top-6 border-l border-t`} />
      <span className={`${base} right-6 top-6 border-r border-t`} />
      <span className={`${base} bottom-6 left-6 border-b border-l`} />
      <span className={`${base} bottom-6 right-6 border-b border-r`} />
    </>
  );
}

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#0a2c4d] lg:flex lg:flex-col lg:justify-between lg:p-8">
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(125,211,252,1) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,1) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
        }}
      />
      <CornerMarks />

      <Logo className="relative z-10" />

      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {NOTES.map((note) => (
          <Typewriter
            key={note.text}
            text={note.text}
            delay={note.delay}
            duration={0.8}
            className={`pointer-events-none absolute font-mono text-[9px] tracking-wide text-cyan-300/35 ${note.className}`}
          />
        ))}
        <FloorScene />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="relative z-10 max-w-md shrink-0"
      >
        <h1 className="text-2xl font-semibold leading-tight text-white">
          Documentação técnica sem retrabalho.
        </h1>
        <p className="mt-2.5 text-sm text-slate-300/80">
          Formulário curto na entrada, documento completo na saída — pronto para o
          protocolo, sem passar horas formatando ABNT à mão.
        </p>
        <ul className="mt-5 space-y-3">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-slate-200/90">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-cyan-400/20 bg-white/5">
                <Icon className="size-3.5 text-cyan-400" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </motion.div>
    </div>
  );
}
