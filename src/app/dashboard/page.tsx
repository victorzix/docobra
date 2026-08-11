import Link from "next/link";

import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function DashboardPage() {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Olá, {nomes?.usuarioNome ?? "usuário"}</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/dashboard/memorial">
          <Card className="hover:bg-accent transition-colors">
            <CardHeader>
              <CardTitle>Memorial Descritivo</CardTitle>
              <CardDescription>Gerar documento técnico a partir de um formulário.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link href="/dashboard/comunique-se">
          <Card className="hover:bg-accent transition-colors">
            <CardHeader>
              <CardTitle>Comunique-se</CardTitle>
              <CardDescription>Traduzir exigências da prefeitura em checklist.</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
