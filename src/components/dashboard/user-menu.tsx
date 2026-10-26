"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

import { useLogout } from "@/hooks/use-logout";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  usuarioNome: string;
  empresaNome: string;
}

export function UserMenu({ usuarioNome, empresaNome }: UserMenuProps) {
  const router = useRouter();
  const logout = useLogout();

  function handleLogout() {
    logout.mutate(undefined, {
      onSuccess: () => router.push("/login"),
    });
  }

  return (
    <div className="flex flex-col gap-2 px-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium text-sidebar-foreground">{usuarioNome}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">{empresaNome}</p>
        </div>
        <Link
          href="/dashboard/configuracoes/assinatura"
          aria-label="Configurações"
          title="Configurações"
          className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-white/10 hover:text-sidebar-foreground"
        >
          <Settings className="size-4" />
        </Link>
      </div>
      {logout.isError && (
        <p className="text-xs text-orange-300">{logout.error.message}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={logout.isPending}
        onClick={handleLogout}
        className="border-white/15 bg-transparent text-sidebar-foreground hover:bg-white/10 hover:text-sidebar-foreground"
      >
        {logout.isPending ? "Saindo..." : "Sair"}
      </Button>
    </div>
  );
}
