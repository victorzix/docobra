"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { FileText, ListChecks } from "lucide-react";

const LOOP = { repeat: Infinity, ease: "easeInOut" as const };

const LINHAS_MEMORIAL = [
  { largura: 92, atraso: 0.2 },
  { largura: 78, atraso: 0.6 },
  { largura: 86, atraso: 1.0 },
  { largura: 54, atraso: 1.4 },
];

const ITENS_CHECKLIST = [
  { largura: 70, atraso: 0.4 },
  { largura: 58, atraso: 1.5 },
  { largura: 76, atraso: 2.6 },
  { largura: 48, atraso: 3.7 },
];

function LinhaMemorial({ largura, atraso, parado }: { largura: number; atraso: number; parado: boolean }) {
  return (
    <div className="h-1.5 rounded-full bg-white/10">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-cyan-300/80 to-violet-400/80"
        initial={{ width: parado ? `${largura}%` : "0%" }}
        animate={parado ? undefined : { width: ["0%", `${largura}%`, `${largura}%`, "0%"] }}
        transition={{ duration: 7, times: [0, 0.3, 0.85, 1], delay: atraso, ...LOOP }}
      />
    </div>
  );
}

function ItemChecklist({ largura, atraso, parado }: { largura: number; atraso: number; parado: boolean }) {
  const ciclo = { duration: 8, times: [0, 0.12, 0.85, 1], delay: atraso, ...LOOP };

  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-4 shrink-0 items-center justify-center rounded border border-white/30">
        <svg viewBox="0 0 16 16" className="size-3" fill="none">
          <motion.path
            d="M3 8.5l3.2 3.2L13 5"
            stroke="#67e8f9"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: parado ? 1 : 0 }}
            animate={parado ? undefined : { pathLength: [0, 1, 1, 0] }}
            transition={ciclo}
          />
        </svg>
      </span>
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-white/50"
          style={{ width: `${largura}%` }}
          animate={parado ? undefined : { opacity: [1, 0.35, 0.35, 1] }}
          transition={ciclo}
        />
      </div>
    </div>
  );
}

function Mira({ className }: { className: string }) {
  return (
    <motion.svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`absolute size-6 text-cyan-300/50 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.2}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, delay: 0.8 }}
    >
      <path d="M12 2v7M12 15v7M2 12h7M15 12h7" />
      <circle cx={12} cy={12} r={2} />
    </motion.svg>
  );
}

export function HeroDecor() {
  const parado = useReducedMotion() ?? false;
  const { scrollY } = useScroll();

  // Os dois lados derivam em velocidades diferentes e somem perto do fim do
  // sticky, junto com o texto — dá profundidade sem competir com a cena.
  const yEsquerda = useTransform(scrollY, [0, 900], [0, -110]);
  const yDireita = useTransform(scrollY, [0, 900], [0, -70]);
  const opacidade = useTransform(scrollY, [0, 600, 1000], [1, 0.9, 0]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <motion.div style={{ opacity: opacidade }} className="absolute inset-0">
        <Mira className="top-[16%] left-[5%] hidden md:block" />
        <Mira className="right-[5%] bottom-[14%] hidden md:block" />
        <Mira className="top-[12%] right-[22%] hidden xl:block" />

        <motion.div
          style={{ y: yEsquerda }}
          className="absolute top-[24%] left-[3%] hidden w-60 2xl:left-[8%] xl:block"
        >
          <motion.div
            initial={{ opacity: 0, x: -30, rotate: -10 }}
            animate={{ opacity: 1, x: 0, rotate: -6 }}
            transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          >
            <motion.div
              animate={parado ? undefined : { y: [0, -10, 0] }}
              transition={{ duration: 6, ...LOOP }}
              className="rounded-2xl border border-white/15 bg-white/[0.06] p-4 shadow-2xl shadow-black/30 backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 text-cyan-200">
                <FileText className="size-4" />
                <span className="font-mono text-[0.6rem] font-semibold tracking-widest uppercase">
                  Memorial descritivo
                </span>
              </div>
              <div className="mt-4 grid gap-2.5">
                {LINHAS_MEMORIAL.map((linha) => (
                  <LinhaMemorial key={linha.atraso} {...linha} parado={parado} />
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="rounded-md bg-gradient-to-r from-cyan-400/25 to-violet-400/25 px-2 py-1 font-mono text-[0.6rem] font-semibold tracking-wider text-cyan-100">
                  ABNT ✓
                </span>
                <span className="font-mono text-[0.6rem] text-slate-400">12 págs.</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: yDireita }}
          className="absolute top-[30%] right-[3%] hidden w-60 2xl:right-[8%] xl:block"
        >
          <motion.div
            initial={{ opacity: 0, x: 30, rotate: 9 }}
            animate={{ opacity: 1, x: 0, rotate: 5 }}
            transition={{ duration: 0.8, delay: 0.7, ease: "easeOut" }}
          >
            <motion.div
              animate={parado ? undefined : { y: [0, -9, 0] }}
              transition={{ duration: 7, delay: 1, ...LOOP }}
              className="rounded-2xl border border-white/15 bg-white/[0.06] p-4 shadow-2xl shadow-black/30 backdrop-blur-sm"
            >
              <div className="flex items-center gap-2 text-fuchsia-200">
                <ListChecks className="size-4" />
                <span className="font-mono text-[0.6rem] font-semibold tracking-widest uppercase">
                  Comunique-se · CS-0001
                </span>
              </div>
              <div className="mt-4 grid gap-3">
                {ITENS_CHECKLIST.map((item) => (
                  <ItemChecklist key={item.atraso} {...item} parado={parado} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div
          style={{ y: yEsquerda }}
          className="absolute bottom-[15%] left-[6%] hidden w-56 lg:block"
        >
          <svg viewBox="0 0 224 36" className="w-full overflow-visible" fill="none">
            <motion.path
              d="M2 24h220M2 16v16M222 16v16"
              stroke="#67e8f9"
              strokeOpacity={0.55}
              strokeWidth={1.2}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.4, delay: 0.9, ease: "easeInOut" }}
            />
            <motion.text
              x={112}
              y={14}
              textAnchor="middle"
              fill="#a5f3fc"
              fillOpacity={0.8}
              fontSize={10}
              fontFamily="var(--font-geist-mono)"
              letterSpacing={0.8}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 2.1 }}
            >
              12,40 m
            </motion.text>
          </svg>
        </motion.div>

        <motion.div
          style={{ y: yDireita }}
          className="absolute right-[7%] bottom-[18%] hidden lg:block"
        >
          <svg viewBox="0 0 120 56" className="w-28 overflow-visible" fill="none">
            <motion.path
              d="M4 40h112M60 40l-9-14h18z"
              stroke="#f0abfc"
              strokeOpacity={0.6}
              strokeWidth={1.2}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, delay: 1.2, ease: "easeInOut" }}
            />
            <motion.text
              x={60}
              y={14}
              textAnchor="middle"
              fill="#f5d0fe"
              fillOpacity={0.85}
              fontSize={10}
              fontFamily="var(--font-geist-mono)"
              letterSpacing={0.8}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 2.2 }}
            >
              N.A. +2,80
            </motion.text>
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
