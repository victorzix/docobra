"use client";

import { motion, type Variants } from "framer-motion";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const PERGUNTAS = [
  {
    pergunta: "Meus dados de projeto ficam seguros?",
    resposta:
      "Sim. Cada empresa só acessa os próprios projetos, e os documentos gerados ficam vinculados exclusivamente à sua conta.",
  },
  {
    pergunta: "Que formato de PDF o Comunique-se aceita?",
    resposta:
      "Qualquer PDF emitido pela prefeitura como Comunique-se, desde que tenha texto (não só uma imagem escaneada sem camada de texto).",
  },
  {
    pergunta: "Dá pra usar pelo celular?",
    resposta: "Dá. O DocObra funciona direto no navegador do celular, sem precisar instalar nada.",
  },
  {
    pergunta: "Preciso ter o PDF do Comunique-se em mãos pra usar o sistema?",
    resposta:
      "Só pro módulo de tradução de exigências. O Memorial Descritivo você gera do zero, direto no formulário.",
  },
  {
    pergunta: "Quanto tempo leva pra gerar um documento?",
    resposta: "Poucos minutos — o formulário é curto e o processamento é automático.",
  },
];

const CONTAINER: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};

const ITEM: Variants = {
  oculto: { opacity: 0, y: 24, scale: 0.98 },
  visivel: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: "easeOut" } },
};

export function Faq() {
  return (
    <section id="faq" className="relative overflow-hidden bg-background px-6 py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-0 size-[30rem] rounded-full bg-fuchsia-500/10 blur-[130px]"
      />

      <div className="relative mx-auto max-w-3xl">
        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-80px" }}
          variants={CONTAINER}
          className="text-center"
        >
          <motion.div variants={ITEM} className="flex flex-col items-center">
            <span className="bg-gradient-to-r from-cyan-700 via-violet-600 to-fuchsia-700 bg-clip-text font-mono text-xs font-semibold tracking-widest text-transparent uppercase">
              FAQ
            </span>
            <span className="marca-gradiente mt-2 h-0.5 w-16 rounded-full" />
          </motion.div>

          <motion.h2
            variants={ITEM}
            className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Perguntas frequentes
          </motion.h2>
        </motion.div>

        <motion.div
          initial="oculto"
          whileInView="visivel"
          viewport={{ once: true, margin: "-60px" }}
          variants={CONTAINER}
          className="mt-14"
        >
          <Accordion type="single" collapsible className="flex flex-col gap-3">
            {PERGUNTAS.map((item, indice) => (
              // O motion.div envolvendo o AccordionItem é seguro: o Radix ordena
              // os itens por querySelectorAll no nó da coleção (busca recursiva),
              // então elementos intermediários não quebram a navegação por teclado.
              <motion.div
                key={item.pergunta}
                variants={ITEM}
                className="rounded-xl border border-border bg-card px-5 shadow-sm transition-all duration-300 hover:border-violet-400/60 hover:shadow-md"
              >
                <AccordionItem value={`item-${indice}`} className="border-b-0">
                  <AccordionTrigger className="gap-4 py-5 text-left text-base font-semibold hover:no-underline">
                    <span className="flex items-center gap-4">
                      {/* aria-hidden: é numeração decorativa e entraria no nome
                          acessível do botão ("01, Meus dados...") sem isso. */}
                      <span
                        aria-hidden
                        className="marca-gradiente-escuro flex size-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold text-white shadow-sm"
                      >
                        {String(indice + 1).padStart(2, "0")}
                      </span>
                      {item.pergunta}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="pl-12 text-base text-muted-foreground">
                    {item.resposta}
                  </AccordionContent>
                </AccordionItem>
              </motion.div>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
}
