"use client";

import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { FileCheck2, ListChecks, Mic, Sparkles, type LucideIcon } from "lucide-react";

interface Chip {
  icone: LucideIcon;
  rotulo: string;
  posicao: string;
  atraso: number;
}

const BLOCOS: {
  key: string;
  passo: string;
  url: string;
  titulo: string;
  descricao: string;
  imagem: string;
  imagemLargura: number;
  imagemAltura: number;
  corte: string;
  respiro: string;
  alt: string;
  chips: Chip[];
}[] = [
  {
    key: "memorial",
    passo: "01",
    url: "docobra.app/memorial",
    titulo: "Memorial Descritivo em minutos",
    descricao:
      "Preencha um formulário curto — pode ser até por áudio — e receba um documento técnico completo, já formatado em ABNT, pronto pra protocolar.",
    imagem: "/landing/screenshots/memorial-2x.png",
    imagemLargura: 1280,
    imagemAltura: 1796,
    corte: "max-h-[26rem]",
    respiro: "",
    alt: "Formulário de criação do Memorial Descritivo no DocObra",
    chips: [
      { icone: Mic, rotulo: "Texto ou áudio", posicao: "right-4 top-3 sm:right-6 sm:top-4", atraso: 0 },
      { icone: FileCheck2, rotulo: "Formatado em ABNT", posicao: "bottom-3 left-4 sm:bottom-4 sm:left-6", atraso: 1.2 },
    ],
  },
  {
    key: "comunique-se",
    passo: "02",
    url: "docobra.app/comunique-se",
    titulo: "Entenda o Comunique-se sem reler o PDF inteiro",
    descricao:
      "Suba o PDF que a prefeitura emitiu e receba um checklist em linguagem simples, com cada exigência traduzida em uma tarefa objetiva.",
    imagem: "/landing/screenshots/comunique-se.png",
    imagemLargura: 672,
    imagemAltura: 296,
    corte: "",
    respiro: "p-4 sm:p-6",
    alt: "Checklist de exigências do Comunique-se no DocObra",
    chips: [
      { icone: Sparkles, rotulo: "Linguagem simples", posicao: "right-4 top-3 sm:right-6 sm:top-4", atraso: 0.6 },
      { icone: ListChecks, rotulo: "Uma tarefa por exigência", posicao: "bottom-3 left-4 sm:bottom-4 sm:left-6", atraso: 1.8 },
    ],
  },
];

const CONTAINER: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.18, delayChildren: 0.05 } },
};

const ITEM_IMAGEM: Variants = {
  oculto: { opacity: 0, y: 36, scale: 0.94 },
  visivel: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: "easeOut" } },
};

const ITEM_TEXTO: Variants = {
  oculto: { opacity: 0, y: 24 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

const GRADE_FUNDO = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="relative overflow-hidden bg-background px-6 py-28">
      {/* Brilho de fundo bem lavado, só pra seção não ficar branco chapado. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[130px]"
      />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER}
          className="mx-auto max-w-2xl text-center"
        >
          <motion.div variants={ITEM_TEXTO} className="flex flex-col items-center">
            <span className="bg-gradient-to-r from-cyan-700 via-violet-600 to-fuchsia-700 bg-clip-text font-mono text-xs font-semibold tracking-widest text-transparent uppercase">
              Como funciona
            </span>
            <span className="marca-gradiente mt-2 h-0.5 w-16 rounded-full" />
          </motion.div>

          <motion.h2
            variants={ITEM_TEXTO}
            className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Dois módulos, dois problemas resolvidos
          </motion.h2>
        </motion.div>

        <div className="mt-20 grid gap-24">
          {BLOCOS.map((bloco, indice) => {
            const imagemADireita = indice % 2 === 1;

            return (
              <motion.div
                key={bloco.key}
                initial="oculto"
                whileInView="visivel"
                viewport={{ once: true, margin: "-100px" }}
                variants={CONTAINER}
                className={`grid items-center gap-10 md:grid-cols-2 ${
                  imagemADireita ? "md:[&>*:first-child]:order-2" : ""
                }`}
              >
                {/* O lift fica no wrapper pra levar o palco inteiro junto.
                    transition-[translate] e não transition-transform: este
                    último inclui `transform` na transition-property, e o
                    framer-motion escreve `transform` inline a cada frame na
                    entrada — a transição de 500ms interpolaria cada frame e
                    empastelaria a animação. O lift usa só a propriedade
                    `translate`. */}
                <motion.div
                  variants={ITEM_IMAGEM}
                  className="group relative transition-[translate] duration-500 hover:-translate-y-2"
                >
                  <div className="relative overflow-hidden rounded-3xl bg-[#0a2c4d] px-5 py-12 shadow-2xl shadow-[#0a2c4d]/30 sm:px-10 sm:py-16">
                    <div aria-hidden className="absolute inset-0" style={GRADE_FUNDO} />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -top-24 -left-20 size-72 rounded-full bg-cyan-400/30 blur-[90px]"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute -right-20 -bottom-24 size-80 rounded-full bg-fuchsia-500/30 blur-[100px]"
                    />
                    <div
                      aria-hidden
                      className="pointer-events-none absolute top-1/3 left-1/2 size-64 -translate-x-1/2 rounded-full bg-violet-500/25 blur-[100px]"
                    />

                    {/* Inclinação só no wrapper interno: o motion.div acima já
                        escreve `transform` inline na entrada e sobrescreveria. */}
                    <div
                      className={`relative transition-transform duration-500 group-hover:[transform:none] ${
                        imagemADireita
                          ? "[transform:perspective(1600px)_rotateY(-7deg)_rotateX(2deg)]"
                          : "[transform:perspective(1600px)_rotateY(7deg)_rotateX(2deg)]"
                      }`}
                    >
                      <div className="overflow-hidden rounded-xl bg-white shadow-2xl shadow-black/50 ring-1 ring-white/20">
                        {/* Chrome de janela — dá cara de produto real em vez de
                            print solto. aria-hidden: a URL é falsa, decorativa,
                            e um leitor de tela anunciaria como conteúdo real. */}
                        <div
                          aria-hidden
                          className="flex items-center gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full bg-red-400" />
                            <span className="size-2.5 rounded-full bg-amber-400" />
                            <span className="size-2.5 rounded-full bg-emerald-400" />
                          </div>
                          <div className="flex-1 truncate rounded-md bg-white px-3 py-1 font-mono text-[0.65rem] text-slate-500">
                            {bloco.url}
                          </div>
                        </div>

                        <div className={`relative overflow-hidden ${bloco.corte} ${bloco.respiro}`}>
                          <Image
                            src={bloco.imagem}
                            alt={bloco.alt}
                            width={bloco.imagemLargura}
                            height={bloco.imagemAltura}
                            sizes="(min-width: 768px) 50vw, 100vw"
                            className="h-auto w-full"
                          />
                          {bloco.corte && (
                            <div
                              aria-hidden
                              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-white to-transparent"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {bloco.chips.map((chip) => (
                      <motion.div
                        key={chip.rotulo}
                        aria-hidden
                        animate={{ y: [0, -8, 0] }}
                        transition={{
                          duration: 4.5,
                          delay: chip.atraso,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                        className={`absolute z-10 flex items-center gap-2.5 rounded-xl bg-white/95 py-2 pr-4 pl-2 shadow-xl shadow-black/30 ring-1 ring-white/60 backdrop-blur ${chip.posicao}`}
                      >
                        <span className="marca-gradiente-escuro flex size-8 items-center justify-center rounded-lg text-white">
                          <chip.icone className="size-4" />
                        </span>
                        <span className="text-sm font-semibold whitespace-nowrap text-slate-800">
                          {chip.rotulo}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div variants={ITEM_TEXTO}>
                  <span className="bg-gradient-to-br from-cyan-700 via-violet-600 to-fuchsia-700 bg-clip-text font-mono text-5xl font-bold text-transparent">
                    {bloco.passo}
                  </span>
                  <h3 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                    {bloco.titulo}
                  </h3>
                  <p className="mt-4 text-lg text-muted-foreground">{bloco.descricao}</p>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
