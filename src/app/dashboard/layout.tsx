import { getSessionUser } from "@/lib/auth/session";
import { buscarNomesUsuarioEEmpresa } from "@/db/queries/usuario";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const sessao = await getSessionUser();
  const nomes = sessao ? await buscarNomesUsuarioEEmpresa(sessao.userId) : null;

  return (
    <SidebarProvider>
      <DashboardSidebar
        footer={
          nomes && <UserMenu usuarioNome={nomes.usuarioNome} empresaNome={nomes.empresaNome} />
        }
      />
      <SidebarInset>
        <header className="flex h-14 items-center border-b px-4">
          <SidebarTrigger />
        </header>
        <main className="p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
