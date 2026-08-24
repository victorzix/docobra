"use client";

import Image from "next/image";
import { motion, type Variants } from "framer-motion";

const BLOCOS = [
  {
    key: "memorial",
    passo: "01",
    url: "docobra.app/memorial",
    titulo: "Memorial Descritivo em minutos",
    descricao:
      "Preencha um formulário curto — pode ser até por áudio — e receba um documento técnico completo, já formatado em ABNT, pronto pra protocolar.",
    imagem: "/landing/screenshots/memorial.png",
    imagemLargura: 672,
    imagemAltura: 781,
    alt: "Formulário de criação do Memorial Descritivo no DocObra",
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
    alt: "Checklist de exigências do Comunique-se no DocObra",
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
          {BLOCOS.map((bloco, indice) => (
            <motion.div
              key={bloco.key}
              initial="oculto"
              whileInView="visivel"
              viewport={{ once: true, margin: "-100px" }}
              variants={CONTAINER}
              className={`grid items-center gap-10 md:grid-cols-2 ${
                indice % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              {/* O lift fica no wrapper (e não no card interno) pra levar o halo
                  junto — senão o brilho descola e fica embaixo do card. */}
              {/* transition-[translate] e não transition-transform: este último
                  inclui `transform` na transition-property, e o framer-motion
                  escreve `transform` inline a cada frame na entrada — a
                  transição de 500ms interpolaria cada frame e empastelaria a
                  animação. O lift usa só a propriedade `translate`. */}
              <motion.div
                variants={ITEM_IMAGEM}
                className="group relative transition-[translate] duration-500 hover:-translate-y-2"
              >
                {/* Halo do gradiente de marca, revelado no hover. */}
                <div
                  aria-hidden
                  className="marca-gradiente pointer-events-none absolute -inset-1 rounded-[1.25rem] opacity-0 blur-lg transition-opacity duration-500 group-hover:opacity-70"
                />

                <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-lg transition-shadow duration-500 group-hover:shadow-2xl">
                  {/* Chrome de janela — dá cara de produto real em vez de print
                      solto. aria-hidden: a URL é falsa, decorativa, e um leitor
                      de tela anunciaria como conteúdo real. */}
                  <div
                    aria-hidden
                    className="flex items-center gap-3 border-b border-border bg-muted/60 px-4 py-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-full bg-red-400/80" />
                      <span className="size-2.5 rounded-full bg-amber-400/80" />
                      <span className="size-2.5 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="flex-1 truncate rounded-md bg-background/80 px-3 py-1 font-mono text-[0.65rem] text-muted-foreground">
                      {bloco.url}
                    </div>
                  </div>

                  <Image
                    src={bloco.imagem}
                    alt={bloco.alt}
                    width={bloco.imagemLargura}
                    height={bloco.imagemAltura}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="h-auto w-full"
                  />
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
          ))}
        </div>
      </div>
    </section>
  );
}
