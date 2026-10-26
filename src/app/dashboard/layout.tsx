import { cookies } from "next/headers";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { buscarAssinaturaVigente } from "@/db/queries/assinatura";
import { derivarStatus } from "@/lib/permissoes/status-assinatura";
import { descreverAvisoDeAssinatura } from "@/lib/planos/descrever-aviso-de-assinatura";
import { diasRestantesAte } from "@/lib/planos/dias-restantes";
import { AvisoDeAssinatura } from "@/components/dashboard/aviso-de-assinatura";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export const metadata: Metadata = {
  title: {
    default: "Dashboard",
    template: "%s — DocObra",
  },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;
  const agora = new Date();
  const vigente = sessao ? await buscarAssinaturaVigente(sessao.empresaId) : null;
  const aviso = vigente
    ? descreverAvisoDeAssinatura({
        status: derivarStatus(vigente, agora),
        venceEm: vigente.venceEm.toISOString(),
        diasRestantes: diasRestantesAte(vigente.venceEm, agora),
      })
    : null;
  const cookieStore = await cookies();
  const sidebarAberta = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarAberta}>
      <DashboardSidebar
        footer={
          nomes && <UserMenu usuarioNome={nomes.usuarioNome} empresaNome={nomes.empresaNome} />
        }
      />
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        {aviso && <AvisoDeAssinatura aviso={aviso} />}
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
