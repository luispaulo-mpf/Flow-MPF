"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"

export type ActionResult = { error: string | null }

export async function createComment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role === "VISUALIZACAO") {
    return { error: "Você não tem permissão para comentar." }
  }

  const content = String(formData.get("content") ?? "").trim()
  const orderId = String(formData.get("order_id") ?? "") || null
  const taskId = String(formData.get("task_id") ?? "") || null

  if (!content) return { error: "Escreva um comentário." }
  if (!orderId && !taskId) return { error: "Comentário sem destino." }

  const supabase = await createClient()
  const { error } = await supabase.from("comments").insert({
    company_id: user.companyId,
    order_id: orderId,
    task_id: taskId,
    user_id: user.id,
    content,
  })

  if (error) return { error: "Não foi possível salvar o comentário." }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    taskId,
    action: "Comentário criado",
    description: content.slice(0, 140),
  })

  if (orderId) revalidatePath(`/pedidos/${orderId}`)
  if (taskId) revalidatePath(`/tarefas`)
  return { error: null }
}
