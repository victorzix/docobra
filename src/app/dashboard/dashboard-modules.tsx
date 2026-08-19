"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ClipboardList, FileText, type LucideIcon } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface Modulo {
  href: string;
  titulo: string;
  descricao: string;
  icon: LucideIcon;
  cor: "primary" | "accent";
}

const MODULOS: Modulo[] = [
  {
    href: "/dashboard/memorial",
    titulo: "Memorial Descritivo",
    descricao: "Gerar documento técnico a partir de um formulário, formatado em ABNT.",
    icon: FileText,
    cor: "primary",
  },
  {
    href: "/dashboard/comunique-se",
    titulo: "Comunique-se",
    descricao: "Traduzir exigências da prefeitura em um checklist simples.",
    icon: ClipboardList,
    cor: "accent",
  },
];

export function DashboardModules() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {MODULOS.map((modulo, index) => (
        <motion.div
          key={modulo.href}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.08 }}
          whileHover={{ y: -4 }}
        >
          <Link href={modulo.href} className="group block h-full">
            <Card className="h-full gap-4 border-border/60 p-7 transition-shadow duration-200 group-hover:shadow-lg group-hover:border-primary/30">
              <div
                className={
                  modulo.cor === "primary"
                    ? "flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
                    : "flex size-12 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600"
                }
              >
                <modulo.icon className="size-6" />
              </div>
              <div className="flex flex-col gap-1.5">
                <CardTitle className="text-lg">{modulo.titulo}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {modulo.descricao}
                </CardDescription>
              </div>
              <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-all group-hover:gap-2.5">
                Começar
                <ArrowRight className="size-4" />
              </span>
            </Card>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
