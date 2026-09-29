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

  // Only keep mentions of real, active users of this company; the database
  // trigger turns them into notifications.
  let requestedMentions: string[] = []
  try {
    const parsed = JSON.parse(String(formData.get("mentioned_user_ids") ?? "[]"))
    if (Array.isArray(parsed)) requestedMentions = parsed.filter((v) => typeof v === "string")
  } catch {
    requestedMentions = []
  }
  let mentionedUserIds: string[] = []
  if (requestedMentions.length > 0) {
    const { data: mentioned } = await supabase
      .from("users")
      .select("id")
      .eq("company_id", user.companyId)
      .eq("active", true)
      .in("id", requestedMentions)
    mentionedUserIds = (mentioned ?? []).map((u) => u.id).filter((id) => id !== user.id)
  }

  const { error } = await supabase.from("comments").insert({
    company_id: user.companyId,
    order_id: orderId,
    task_id: taskId,
    user_id: user.id,
    content,
    mentioned_user_ids: mentionedUserIds,
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
  revalidatePath("/mencoes")
  return { error: null }
}
