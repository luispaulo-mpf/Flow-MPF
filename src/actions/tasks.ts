"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canEditTask } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"

export type ActionResult = { error: string | null }

export async function createTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role === "VISUALIZACAO") {
    return { error: "Você não tem permissão para criar tarefas." }
  }

  const title = String(formData.get("title") ?? "").trim()
  const description = String(formData.get("description") ?? "") || null
  const orderId = String(formData.get("order_id") ?? "") || null
  const responsibleUserId = String(formData.get("responsible_user_id") ?? "") || null
  const priority = String(formData.get("priority") ?? "NORMAL")
  const dueDate = String(formData.get("due_date") ?? "") || null

  if (!title) return { error: "Informe um título para a tarefa." }

  const supabase = await createClient()
  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      company_id: user.companyId,
      order_id: orderId,
      title,
      description,
      responsible_user_id: responsibleUserId,
      created_by: user.id,
      priority,
      due_date: dueDate,
    })
    .select("id")
    .single()

  if (error) return { error: "Não foi possível criar a tarefa." }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    taskId: task.id,
    action: "Tarefa criada",
    description: `Tarefa "${title}" criada.`,
  })

  revalidatePath("/tarefas")
  revalidatePath("/dashboard")
  if (orderId) revalidatePath(`/pedidos/${orderId}`)
  return { error: null }
}

async function assertCanEditTask(taskId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: task } = await supabase
    .from("tasks")
    .select("id, company_id, order_id, responsible_user_id, created_by, title, status")
    .eq("id", taskId)
    .single()

  if (!task) throw new Error("Tarefa não encontrada.")
  if (!canEditTask(user.role, task.responsible_user_id, task.created_by, user.id)) {
    throw new Error("Sem permissão para alterar esta tarefa.")
  }
  return { user, supabase, task }
}

export async function updateTaskStatus(taskId: string, status: string) {
  const { user, supabase, task } = await assertCanEditTask(taskId)

  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId)
  if (error) throw new Error("Não foi possível atualizar a tarefa.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: task.order_id,
    taskId,
    action: status === "DONE" ? "Tarefa concluída" : "Tarefa atualizada",
    description: `Tarefa "${task.title}" alterada para ${status}.`,
  })

  revalidatePath("/tarefas")
  revalidatePath("/dashboard")
  if (task.order_id) revalidatePath(`/pedidos/${task.order_id}`)
}

export async function updateTaskResponsible(taskId: string, responsibleUserId: string | null) {
  const { user, supabase, task } = await assertCanEditTask(taskId)

  const { error } = await supabase
    .from("tasks")
    .update({ responsible_user_id: responsibleUserId })
    .eq("id", taskId)
  if (error) throw new Error("Não foi possível atualizar o responsável.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: task.order_id,
    taskId,
    action: "Responsável alterado",
    description: `Responsável da tarefa "${task.title}" alterado.`,
  })

  revalidatePath("/tarefas")
  if (task.order_id) revalidatePath(`/pedidos/${task.order_id}`)
}

export async function updateTaskPriority(taskId: string, priority: string) {
  const { user, supabase, task } = await assertCanEditTask(taskId)

  const { error } = await supabase.from("tasks").update({ priority }).eq("id", taskId)
  if (error) throw new Error("Não foi possível atualizar a prioridade.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: task.order_id,
    taskId,
    action: "Tarefa atualizada",
    description: `Prioridade da tarefa "${task.title}" alterada para ${priority}.`,
  })

  revalidatePath("/tarefas")
  if (task.order_id) revalidatePath(`/pedidos/${task.order_id}`)
}

export async function updateTaskDueDate(taskId: string, dueDate: string | null) {
  const { user, supabase, task } = await assertCanEditTask(taskId)

  const { error } = await supabase.from("tasks").update({ due_date: dueDate }).eq("id", taskId)
  if (error) throw new Error("Não foi possível atualizar o prazo.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: task.order_id,
    taskId,
    action: "Tarefa atualizada",
    description: `Prazo da tarefa "${task.title}" alterado.`,
  })

  revalidatePath("/tarefas")
  if (task.order_id) revalidatePath(`/pedidos/${task.order_id}`)
}

export async function updateTask(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const taskId = String(formData.get("task_id") ?? "")
  if (!taskId) return { error: "Tarefa inválida." }

  try {
    const { user, supabase, task } = await assertCanEditTask(taskId)

    const title = String(formData.get("title") ?? "").trim()
    const description = String(formData.get("description") ?? "") || null
    const responsibleUserId = String(formData.get("responsible_user_id") ?? "") || null
    const priority = String(formData.get("priority") ?? "NORMAL")
    const status = String(formData.get("status") ?? "TODO")
    const dueDate = String(formData.get("due_date") ?? "") || null

    if (!title) return { error: "Informe um título para a tarefa." }

    const { error } = await supabase
      .from("tasks")
      .update({
        title,
        description,
        responsible_user_id: responsibleUserId,
        priority,
        status,
        due_date: dueDate,
      })
      .eq("id", taskId)

    if (error) return { error: "Não foi possível salvar a tarefa." }

    await logActivity(supabase, {
      companyId: user.companyId,
      userId: user.id,
      orderId: task.order_id,
      taskId,
      action: "Tarefa atualizada",
      description: `Tarefa "${title}" atualizada.`,
    })

    revalidatePath("/tarefas")
    revalidatePath("/dashboard")
    if (task.order_id) revalidatePath(`/pedidos/${task.order_id}`)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao salvar a tarefa." }
  }
}
