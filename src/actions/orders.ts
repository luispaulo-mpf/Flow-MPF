"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canEditOrder, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { PRIORITIES } from "@/types/domain"

export type ActionResult = { error: string | null }

export async function createOrder(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireUser()
  if (!canManageOperations(user.role)) {
    return { error: "Você não tem permissão para criar pedidos." }
  }

  const erpOrderNumber = String(formData.get("erp_order_number") ?? "").trim()
  const customerName = String(formData.get("customer_name") ?? "").trim()
  const deliveryDate = String(formData.get("delivery_date") ?? "") || null
  const issueDate = String(formData.get("issue_date") ?? "") || null
  const totalValue = String(formData.get("total_value") ?? "") || null
  const priority = String(formData.get("priority") ?? "NORMAL")
  const statusId = String(formData.get("status_id") ?? "") || null
  const notes = String(formData.get("notes") ?? "") || null

  if (!erpOrderNumber || !customerName) {
    return { error: "Número do pedido e cliente são obrigatórios." }
  }

  const supabase = await createClient()
  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      company_id: user.companyId,
      erp_order_number: erpOrderNumber,
      customer_name: customerName,
      delivery_date: deliveryDate,
      issue_date: issueDate,
      total_value: totalValue ? Number(totalValue) : null,
      priority: PRIORITIES.includes(priority as (typeof PRIORITIES)[number]) ? priority : "NORMAL",
      status_id: statusId,
      notes,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um pedido com esse número nesta empresa." }
    }
    return { error: "Não foi possível criar o pedido." }
  }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: order.id,
    action: "Pedido criado",
    description: `Pedido ${erpOrderNumber} criado manualmente.`,
  })

  revalidatePath("/pedidos")
  revalidatePath("/dashboard")
  redirect(`/pedidos/${order.id}`)
}

async function assertCanEditOrder(orderId: string) {
  const user = await requireUser()
  const supabase = await createClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, company_id, responsible_user_id, erp_order_number")
    .eq("id", orderId)
    .single()

  if (!order) throw new Error("Pedido não encontrado.")
  if (!canEditOrder(user.role, order.responsible_user_id, user.id)) {
    throw new Error("Sem permissão para alterar este pedido.")
  }
  return { user, supabase, order }
}

export async function updateOrderStatus(orderId: string, statusId: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { data: status } = await supabase
    .from("statuses")
    .select("name")
    .eq("id", statusId)
    .single()

  const { error } = await supabase.from("orders").update({ status_id: statusId }).eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar o status.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Status alterado",
    description: `Pedido ${order.erp_order_number} movido para "${status?.name ?? statusId}".`,
  })

  revalidatePath("/pedidos")
  revalidatePath("/kanban")
  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/dashboard")
}

export async function updateOrderResponsible(orderId: string, responsibleUserId: string | null) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  let responsibleName = "ninguém"
  if (responsibleUserId) {
    const { data: responsible } = await supabase
      .from("users")
      .select("name")
      .eq("id", responsibleUserId)
      .single()
    responsibleName = responsible?.name ?? responsibleUserId
  }

  const { error } = await supabase
    .from("orders")
    .update({ responsible_user_id: responsibleUserId })
    .eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar o responsável.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Responsável alterado",
    description: `Pedido ${order.erp_order_number} atribuído a ${responsibleName}.`,
  })

  revalidatePath("/pedidos")
  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/dashboard")
}

export async function updateOrderPriority(orderId: string, priority: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { error } = await supabase.from("orders").update({ priority }).eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar a prioridade.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Prioridade do pedido ${order.erp_order_number} alterada para ${priority}.`,
  })

  revalidatePath("/pedidos")
  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/dashboard")
}

export async function updateOrderDeliveryDate(orderId: string, deliveryDate: string | null) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { error } = await supabase
    .from("orders")
    .update({ delivery_date: deliveryDate })
    .eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar o prazo.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Prazo de entrega do pedido ${order.erp_order_number} alterado.`,
  })

  revalidatePath("/pedidos")
  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/dashboard")
}

export async function updateOrderNotes(orderId: string, notes: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { error } = await supabase.from("orders").update({ notes }).eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar as observações.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Observações do pedido ${order.erp_order_number} atualizadas.`,
  })

  revalidatePath(`/pedidos/${orderId}`)
}
