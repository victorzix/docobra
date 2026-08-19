import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { DashboardModules } from "./dashboard-modules";

export default async function DashboardPage() {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Olá, {nomes?.usuarioNome ?? "usuário"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">O que você quer fazer hoje?</p>
      </div>
      <DashboardModules />
    </div>
  );
}
