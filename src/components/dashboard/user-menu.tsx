"use client";

import { useRouter } from "next/navigation";

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
      <div className="text-sm">
        <p className="font-medium">{usuarioNome}</p>
        <p className="text-muted-foreground text-xs">{empresaNome}</p>
      </div>
      {logout.isError && (
        <p className="text-destructive text-xs">{logout.error.message}</p>
      )}
      <Button variant="outline" size="sm" disabled={logout.isPending} onClick={handleLogout}>
        {logout.isPending ? "Saindo..." : "Sair"}
      </Button>
    </div>
  );
}
