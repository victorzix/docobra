import { getSessionUser } from "@/lib/auth/session";

export default async function DashboardPage() {
  const sessao = await getSessionUser();

  return (
    <div className="p-8">
      <p>Você está logado. Empresa: {sessao?.empresaId}</p>
    </div>
  );
}
