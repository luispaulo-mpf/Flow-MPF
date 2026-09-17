import {
  LayoutDashboard,
  ClipboardList,
  KanbanSquare,
  ListChecks,
  UploadCloud,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react"
import type { Role } from "@/types/domain"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  roles?: Role[]
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare },
  { href: "/tarefas", label: "Tarefas", icon: ListChecks },
  { href: "/importar", label: "Importar ERP", icon: UploadCloud, roles: ["ADMIN", "GESTOR"] },
  { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN"] },
  { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["ADMIN"] },
]
