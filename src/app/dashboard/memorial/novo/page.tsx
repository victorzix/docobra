import { getSessionUser } from "@/lib/auth/session";
import { listarProjetos } from "@/db/queries/projeto";
import { NovoMemorialForm } from "./novo-memorial-form";

export default async function NovoMemorialPage() {
  const sessao = await getSessionUser();
  const projetos = sessao ? await listarProjetos(sessao.empresaId) : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Novo memorial descritivo</h1>
      <NovoMemorialForm projetos={projetos} />
    </div>
  );
}
