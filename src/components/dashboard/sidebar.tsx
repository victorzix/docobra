"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, ClipboardList } from "lucide-react";

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
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold">DocObra</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          {ITENS_NAV.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={ehItemAtivo(pathname, item.href)}>
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
    </Sidebar>
  );
}
