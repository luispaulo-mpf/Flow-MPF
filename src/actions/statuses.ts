"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth"

export type ActionResult = { error: string | null }

export async function createStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role !== "ADMIN") return { error: "Apenas administradores podem gerenciar status." }

  const name = String(formData.get("name") ?? "").trim()
  const color = String(formData.get("color") ?? "#64748b")
  const position = Number(formData.get("position") ?? 0)
  const isFinal = formData.get("is_final") === "on"
  const scope = formData.get("scope") === "ITEM" ? "ITEM" : "ORDER"

  if (!name) return { error: "Informe um nome para o status." }

  const supabase = await createClient()
  const { error } = await supabase.from("statuses").insert({
    company_id: user.companyId,
    name,
    color,
    position,
    is_final: isFinal,
    scope,
  })

  if (error) {
    if (error.code === "23505") return { error: "Já existe um status com esse nome." }
    return { error: "Não foi possível criar o status." }
  }

  revalidatePath("/configuracoes")
  revalidatePath("/kanban")
  revalidatePath("/pedidos")
  return { error: null }
}

export async function updateStatus(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role !== "ADMIN") return { error: "Apenas administradores podem gerenciar status." }

  const id = String(formData.get("id") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const color = String(formData.get("color") ?? "#64748b")
  const position = Number(formData.get("position") ?? 0)
  const isFinal = formData.get("is_final") === "on"
  const active = formData.get("active") === "on"

  if (!id || !name) return { error: "Dados inválidos." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("statuses")
    .update({ name, color, position, is_final: isFinal, active })
    .eq("id", id)
    .eq("company_id", user.companyId)

  if (error) {
    if (error.code === "23505") return { error: "Já existe um status com esse nome." }
    return { error: "Não foi possível atualizar o status." }
  }

  revalidatePath("/configuracoes")
  revalidatePath("/kanban")
  revalidatePath("/pedidos")
  return { error: null }
}
