import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;
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
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
