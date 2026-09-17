"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu, Plus, LogOut, UploadCloud } from "lucide-react"
import { SidebarNav } from "@/components/sidebar-nav"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { signOut } from "@/actions/auth"
import type { CurrentUser } from "@/lib/auth"
import { ROLE_LABELS } from "@/types/domain"

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const canCreate = user.role === "ADMIN" || user.role === "GESTOR" || user.role === "RESPONSAVEL"

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar py-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-4">
          <Image
            src="/brand/mpf-logo-white.svg"
            alt="MPF Hidráulicos"
            width={132}
            height={74}
            className="h-8 w-auto"
            priority
          />
          <span className="rounded-full border border-sidebar-foreground/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/80">
            Flow
          </span>
        </div>
        <SidebarNav role={user.role} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-white px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex items-center gap-2 px-4 py-4">
                <Image
                  src="/brand/mpf-logo-white.svg"
                  alt="MPF Hidráulicos"
                  width={132}
                  height={74}
                  className="h-8 w-auto"
                />
                <span className="rounded-full border border-sidebar-foreground/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/80">
                  Flow
                </span>
              </div>
              <SidebarNav role={user.role} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          {canCreate ? (
            <div className="hidden items-center gap-2 sm:flex">
              <Button asChild size="sm" variant="outline">
                <Link href="/pedidos/novo">
                  <Plus className="size-4" />
                  Novo pedido
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/tarefas?nova=1">
                  <Plus className="size-4" />
                  Nova tarefa
                </Link>
              </Button>
              {user.role === "ADMIN" || user.role === "GESTOR" ? (
                <Button asChild size="sm" variant="outline">
                  <Link href="/importar">
                    <UploadCloud className="size-4" />
                    Importar ERP
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {initials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-sm font-medium sm:inline">{user.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{user.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <form action={signOut} className="w-full">
                  <button type="submit" className="flex w-full items-center gap-2">
                    <LogOut className="size-4" />
                    Sair
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
