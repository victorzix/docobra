import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLANOS = [
  {
    key: "essencial",
    nome: "Essencial",
    descricao: "Pra quem tá começando a validar o fluxo digital.",
    destaque: false,
    itens: [
      "Projetos limitados por mês",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte por email",
    ],
  },
  {
    key: "escritorio",
    nome: "Escritório",
    descricao: "Pra escritórios com volume maior de projetos rodando ao mesmo tempo.",
    destaque: true,
    itens: [
      "Projetos ilimitados",
      "Memorial Descritivo completo",
      "Tradutor de Comunique-se completo",
      "Suporte prioritário",
    ],
  },
];

export function Planos() {
  return (
    <section id="planos" className="bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            Planos
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Um plano pra cada volume de projeto
          </h2>
        </div>

        <div className="mx-auto mt-16 grid max-w-4xl gap-6 sm:grid-cols-2">
          {PLANOS.map((plano) => (
            <Card
              key={plano.key}
              className={plano.destaque ? "border-cyan-600 shadow-md shadow-cyan-900/10" : ""}
            >
              <CardHeader>
                <CardTitle className="text-xl">{plano.nome}</CardTitle>
                <CardDescription>{plano.descricao}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {plano.itens.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-cyan-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button asChild className="w-full bg-cyan-600 text-white hover:bg-cyan-500">
                  <Link href="/register">Começar agora</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
