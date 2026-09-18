"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canEditOrder, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { getDefaultStatusId } from "@/lib/queries"
import { recordOrderItemStatusHistory, recordOrderStatusHistory } from "@/lib/status-history"
import { runPcpAutomation, runEngenhariaAutomation } from "@/lib/automations"
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
    .select("id, status_id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { error: "Já existe um pedido com esse número nesta empresa." }
    }
    return { error: "Não foi possível criar o pedido." }
  }

  if (order.status_id) {
    await recordOrderStatusHistory(supabase, {
      companyId: user.companyId,
      orderId: order.id,
      statusId: order.status_id,
    })
    await runPcpAutomation(supabase, {
      companyId: user.companyId,
      orderId: order.id,
      newStatusId: order.status_id,
      previousStatusId: null,
      createdByUserId: user.id,
    })
  }

  const itemCodes = formData.getAll("item_code").map(String)
  const itemDescriptions = formData.getAll("item_description").map(String)
  const itemQuantities = formData.getAll("item_quantity").map(String)
  const itemUnits = formData.getAll("item_unit").map(String)

  const defaultItemStatusId = await getDefaultStatusId(user.companyId, "ITEM")

  const items = itemDescriptions
    .map((description, i) => ({
      order_id: order.id,
      erp_item_code: itemCodes[i]?.trim() || null,
      description: description.trim(),
      quantity: Number(itemQuantities[i]) || 0,
      unit: itemUnits[i]?.trim() || null,
      status_id: defaultItemStatusId,
    }))
    .filter((item) => item.description.length > 0)

  if (items.length > 0) {
    const { data: insertedItems } = await supabase.from("order_items").insert(items).select("id")
    if (defaultItemStatusId) {
      for (const item of insertedItems ?? []) {
        await recordOrderItemStatusHistory(supabase, {
          companyId: user.companyId,
          orderItemId: item.id,
          statusId: defaultItemStatusId,
        })
      }
    }
  }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: order.id,
    action: "Pedido criado",
    description: `Pedido ${erpOrderNumber} criado manualmente com ${items.length} ${items.length === 1 ? "item" : "itens"}.`,
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
    .select("id, company_id, responsible_user_id, erp_order_number, status_id")
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
  const previousStatusId = order.status_id

  const { data: status } = await supabase
    .from("statuses")
    .select("name")
    .eq("id", statusId)
    .single()

  const { error } = await supabase.from("orders").update({ status_id: statusId }).eq("id", orderId)
  if (error) throw new Error("Não foi possível atualizar o status.")

  if (statusId !== previousStatusId) {
    await recordOrderStatusHistory(supabase, { companyId: user.companyId, orderId, statusId })
    await runPcpAutomation(supabase, {
      companyId: user.companyId,
      orderId,
      newStatusId: statusId,
      previousStatusId,
      createdByUserId: user.id,
    })
  }

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

export async function addOrderItem(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const orderId = String(formData.get("order_id") ?? "")
  if (!orderId) return { error: "Pedido inválido." }

  try {
    const { user, supabase, order } = await assertCanEditOrder(orderId)

    const description = String(formData.get("description") ?? "").trim()
    const code = String(formData.get("code") ?? "").trim() || null
    const quantity = Number(formData.get("quantity")) || 0
    const unit = String(formData.get("unit") ?? "").trim() || null
    const deliveryDate = String(formData.get("delivery_date") ?? "") || null

    if (!description) return { error: "Informe a descrição do item." }

    const defaultItemStatusId = await getDefaultStatusId(user.companyId, "ITEM")

    const { data: insertedItem, error } = await supabase
      .from("order_items")
      .insert({
        order_id: orderId,
        erp_item_code: code,
        description,
        quantity,
        unit,
        delivery_date: deliveryDate,
        status_id: defaultItemStatusId,
      })
      .select("id")
      .single()

    if (error || !insertedItem) return { error: "Não foi possível adicionar o item." }

    if (defaultItemStatusId) {
      await recordOrderItemStatusHistory(supabase, {
        companyId: user.companyId,
        orderItemId: insertedItem.id,
        statusId: defaultItemStatusId,
      })
    }

    await logActivity(supabase, {
      companyId: user.companyId,
      userId: user.id,
      orderId,
      action: "Pedido atualizado",
      description: `Item "${description}" adicionado ao pedido ${order.erp_order_number}.`,
    })

    revalidatePath(`/pedidos/${orderId}`)
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Erro ao adicionar item." }
  }
}

export async function updateOrderItemStatus(orderId: string, itemId: string, statusId: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const [{ data: status }, { data: item }] = await Promise.all([
    supabase.from("statuses").select("name").eq("id", statusId).single(),
    supabase.from("order_items").select("description, status_id").eq("id", itemId).single(),
  ])

  const { error } = await supabase
    .from("order_items")
    .update({ status_id: statusId })
    .eq("id", itemId)
  if (error) throw new Error("Não foi possível atualizar o status do item.")

  if (item && statusId !== item.status_id) {
    await recordOrderItemStatusHistory(supabase, {
      companyId: user.companyId,
      orderItemId: itemId,
      statusId,
    })
  }

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Item "${item?.description ?? itemId}" do pedido ${order.erp_order_number} movido para "${status?.name ?? statusId}".`,
  })

  revalidatePath(`/pedidos/${orderId}`)
}

export async function deleteOrderItem(orderId: string, itemId: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { error } = await supabase.from("order_items").delete().eq("id", itemId)
  if (error) throw new Error("Não foi possível remover o item.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Item removido do pedido ${order.erp_order_number}.`,
  })

  revalidatePath(`/pedidos/${orderId}`)
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

const ENGINEERING_REVIEW_VALUES = ["REVISADO", "NECESSITA_PROJETO", "NECESSITA_REVISAO"] as const

export async function updateItemEngineeringReview(orderId: string, itemId: string, value: string) {
  if (!(ENGINEERING_REVIEW_VALUES as readonly string[]).includes(value)) {
    throw new Error("Opção de revisão inválida.")
  }

  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { data: item } = await supabase
    .from("order_items")
    .select("description")
    .eq("id", itemId)
    .single()

  const { error } = await supabase
    .from("order_items")
    .update({ engineering_review: value })
    .eq("id", itemId)
  if (error) throw new Error("Não foi possível salvar a revisão de engenharia.")

  await runEngenhariaAutomation(supabase, {
    companyId: user.companyId,
    orderId,
    orderErpNumber: order.erp_order_number,
    itemId,
    itemDescription: item?.description ?? itemId,
    review: value as (typeof ENGINEERING_REVIEW_VALUES)[number],
    createdByUserId: user.id,
  })

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Revisão de engenharia do item "${item?.description ?? itemId}" do pedido ${order.erp_order_number} definida como "${value}".`,
  })

  revalidatePath(`/pedidos/${orderId}`)
  revalidatePath("/tarefas")
}
