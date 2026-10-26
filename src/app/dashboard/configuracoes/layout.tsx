import { MenuConfiguracoes } from "@/components/configuracoes/menu-configuracoes";

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <MenuConfiguracoes />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
