"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { isClientWaitStageName } from "@/lib/business-rules"

function revalidateOrder(orderId: string) {
  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/kanban")
  revalidatePath("/dashboard")
  revalidatePath("/reunioes", "layout")
}

async function loadOrder(orderId: string) {
  const user = await requireUser()
  if (!canManageOperations(user.role)) {
    throw new Error("Só gestores podem marcar ou encerrar a espera pelo cliente.")
  }
  const supabase = await createClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, erp_order_number, status_id, statuses(name)")
    .eq("id", orderId)
    .eq("company_id", user.companyId)
    .single()
  if (!order) throw new Error("Pedido não encontrado.")
  return { user, supabase, order }
}

/** Marks the order as held waiting for information from the customer. */
export async function startClientWait(orderId: string, reason: string) {
  const { user, supabase, order } = await loadOrder(orderId)
  const text = reason.trim()
  if (!text) throw new Error("Informe o que está faltando do cliente.")
  const stageName = order.statuses?.name ?? ""
  if (!isClientWaitStageName(stageName)) {
    throw new Error("Só é possível aguardar cliente nas etapas Engenharia e Financeiro.")
  }

  const { error } = await supabase.from("order_client_waits").insert({
    company_id: user.companyId,
    order_id: orderId,
    status_id: order.status_id,
    reason: text,
    started_by: user.id,
  })
  if (error) {
    throw new Error(
      error.code === "23505" ? "Este pedido já está aguardando cliente." : "Não foi possível salvar.",
    )
  }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Aguardando cliente",
    description: `Pedido ${order.erp_order_number} parado em ${stageName} aguardando o cliente: ${text}`,
  })
  revalidateOrder(orderId)
}

/**
 * The customer answered: closes the wait (stage time counts again) and
 * completes the automatic follow-up task, if one was created.
 */
export async function endClientWait(orderId: string) {
  const { user, supabase, order } = await loadOrder(orderId)
  const { data: wait } = await supabase
    .from("order_client_waits")
    .update({ ended_at: new Date().toISOString(), ended_by: user.id })
    .eq("order_id", orderId)
    .is("ended_at", null)
    .select("task_id")
    .maybeSingle()
  if (!wait) throw new Error("Este pedido não está aguardando cliente.")

  if (wait.task_id) {
    await supabase
      .from("tasks")
      .update({ status: "DONE", completed_at: new Date().toISOString() })
      .eq("id", wait.task_id)
      .neq("status", "DONE")
  }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Cliente respondeu",
    description: `Pedido ${order.erp_order_number}: informação do cliente recebida, espera encerrada.`,
  })
  revalidateOrder(orderId)
}
