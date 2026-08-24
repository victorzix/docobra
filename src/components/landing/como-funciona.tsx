"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const BLOCOS = [
  {
    key: "memorial",
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
    titulo: "Entenda o Comunique-se sem reler o PDF inteiro",
    descricao:
      "Suba o PDF que a prefeitura emitiu e receba um checklist em linguagem simples, com cada exigência traduzida em uma tarefa objetiva.",
    imagem: "/landing/screenshots/comunique-se.png",
    imagemLargura: 672,
    imagemAltura: 296,
    alt: "Checklist de exigências do Comunique-se no DocObra",
  },
];

export function ComoFunciona() {
  return (
    <section id="como-funciona" className="bg-background px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            Como funciona
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Dois módulos, dois problemas resolvidos
          </h2>
        </div>

        <div className="mt-16 grid gap-16">
          {BLOCOS.map((bloco, indice) => (
            <motion.div
              key={bloco.key}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className={`grid items-center gap-10 md:grid-cols-2 ${
                indice % 2 === 1 ? "md:[&>*:first-child]:order-2" : ""
              }`}
            >
              <div className="overflow-hidden rounded-xl border shadow-sm">
                <Image
                  src={bloco.imagem}
                  alt={bloco.alt}
                  width={bloco.imagemLargura}
                  height={bloco.imagemAltura}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="h-auto w-full"
                />
              </div>
              <div>
                <h3 className="text-2xl font-semibold tracking-tight">{bloco.titulo}</h3>
                <p className="mt-3 text-muted-foreground">{bloco.descricao}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
