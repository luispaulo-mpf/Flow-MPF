"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { ROLES } from "@/types/domain"

export type ActionResult = { error: string | null }

function randomTempPassword() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16)
}

export async function createUser(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireUser()
  if (admin.role !== "ADMIN") return { error: "Apenas administradores podem criar usuários." }

  const name = String(formData.get("name") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "RESPONSAVEL")

  if (!name || !email) return { error: "Informe nome e e-mail." }
  if (!ROLES.includes(role as (typeof ROLES)[number])) return { error: "Papel inválido." }

  const adminClient = createAdminClient()
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: randomTempPassword(),
    email_confirm: true,
    user_metadata: { name },
  })

  if (createError || !created.user) {
    if (createError?.message?.toLowerCase().includes("already")) {
      return { error: "Já existe uma conta com esse e-mail." }
    }
    return { error: "Não foi possível criar o usuário no Auth." }
  }

  const supabase = await createClient()
  const { error: profileError } = await supabase.from("users").insert({
    id: created.user.id,
    company_id: admin.companyId,
    name,
    email,
    role,
  })

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id)
    return { error: "Não foi possível salvar o perfil do usuário." }
  }

  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email)
  void resetError

  await logActivity(supabase, {
    companyId: admin.companyId,
    userId: admin.id,
    action: "Usuário criado",
    description: `Usuário ${name} (${email}) criado com papel ${role}.`,
  })

  revalidatePath("/usuarios")
  return { error: null }
}

export async function updateUserRole(userId: string, role: string) {
  const admin = await requireUser()
  if (admin.role !== "ADMIN") throw new Error("Apenas administradores podem alterar papéis.")

  const supabase = await createClient()
  const { error } = await supabase.from("users").update({ role }).eq("id", userId)
  if (error) throw new Error("Não foi possível atualizar o papel.")

  await logActivity(supabase, {
    companyId: admin.companyId,
    userId: admin.id,
    action: "Usuário atualizado",
    description: `Papel do usuário alterado para ${role}.`,
  })

  revalidatePath("/usuarios")
}

export async function updateUserActive(userId: string, active: boolean) {
  const admin = await requireUser()
  if (admin.role !== "ADMIN") throw new Error("Apenas administradores podem ativar/desativar usuários.")
  if (userId === admin.id) throw new Error("Você não pode desativar sua própria conta.")

  const supabase = await createClient()
  const { error } = await supabase.from("users").update({ active }).eq("id", userId)
  if (error) throw new Error("Não foi possível atualizar o usuário.")

  await logActivity(supabase, {
    companyId: admin.companyId,
    userId: admin.id,
    action: "Usuário atualizado",
    description: `Usuário ${active ? "ativado" : "desativado"}.`,
  })

  revalidatePath("/usuarios")
}
