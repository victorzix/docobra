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

export function Faq() {
  return (
    <section id="faq" className="bg-background px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            FAQ
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
        </div>

        <Accordion type="single" collapsible className="mt-12">
          {PERGUNTAS.map((item, indice) => (
            <AccordionItem key={item.pergunta} value={`item-${indice}`}>
              <AccordionTrigger className="text-left">{item.pergunta}</AccordionTrigger>
              <AccordionContent>{item.resposta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
