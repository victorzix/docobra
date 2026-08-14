"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FileText, ClipboardList, FolderKanban } from "lucide-react";

import { Logo } from "@/components/common/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const ITENS_NAV = [
  { href: "/dashboard/projetos", label: "Projetos", icon: FolderKanban },
  { href: "/dashboard/memorial", label: "Memorial Descritivo", icon: FileText },
  { href: "/dashboard/comunique-se", label: "Comunique-se", icon: ClipboardList },
];

export function ehItemAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface DashboardSidebarProps {
  footer?: React.ReactNode;
}

export function DashboardSidebar({ footer }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(125,211,252,1) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,1) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <SidebarHeader className="relative border-b border-sidebar-border px-3 py-4">
        <Logo />
      </SidebarHeader>

      <SidebarContent className="relative px-2 py-3">
        <SidebarMenu>
          {ITENS_NAV.map((item) => {
            const ativo = ehItemAtivo(pathname, item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={ativo}
                  className="relative z-10 text-sidebar-foreground/75 transition-[color,background-color] duration-150 hover:bg-white/10 hover:text-sidebar-foreground data-[active=true]:bg-transparent data-[active=true]:font-medium data-[active=true]:text-white"
                >
                  <Link href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
                {ativo && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-md bg-orange-600 shadow-sm"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {footer && (
        <SidebarFooter className="relative border-t border-sidebar-border">{footer}</SidebarFooter>
      )}
    </Sidebar>
  );
}
