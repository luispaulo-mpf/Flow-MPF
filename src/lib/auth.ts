import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { Role } from "@/types/domain"

export type CurrentUser = {
  id: string
  companyId: string
  name: string
  email: string
  role: Role
  active: boolean
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient()
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser()

  if (!authUser) return null

  const { data: profile } = await supabase
    .from("users")
    .select("id, company_id, name, email, role, active")
    .eq("id", authUser.id)
    .single()

  if (!profile) return null

  return {
    id: profile.id,
    companyId: profile.company_id,
    name: profile.name,
    email: profile.email,
    role: profile.role as Role,
    active: profile.active,
  }
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  if (!user.active) redirect("/login?erro=inativo")
  return user
}

export function canManageOperations(role: Role) {
  return role === "ADMIN" || role === "GESTOR"
}

export function canEditOrder(role: Role, responsibleUserId: string | null, userId: string) {
  if (role === "ADMIN" || role === "GESTOR") return true
  if (role === "RESPONSAVEL") return responsibleUserId === userId
  return false
}

export function canEditTask(
  role: Role,
  responsibleUserId: string | null,
  createdBy: string,
  userId: string,
) {
  if (role === "ADMIN" || role === "GESTOR") return true
  if (role === "RESPONSAVEL") return responsibleUserId === userId || createdBy === userId
  return false
}
