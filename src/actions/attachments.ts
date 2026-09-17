"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canEditOrder } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"

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

export async function recordAttachment(params: {
  orderId: string
  fileName: string
  storagePath: string
  contentType: string | null
  sizeBytes: number
}) {
  const { user, supabase, order } = await assertCanEditOrder(params.orderId)

  const { error } = await supabase.from("order_attachments").insert({
    company_id: user.companyId,
    order_id: params.orderId,
    uploaded_by: user.id,
    file_name: params.fileName,
    storage_path: params.storagePath,
    content_type: params.contentType,
    size_bytes: params.sizeBytes,
  })

  if (error) throw new Error("Não foi possível registrar o anexo.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: params.orderId,
    action: "Pedido atualizado",
    description: `Arquivo "${params.fileName}" anexado ao pedido ${order.erp_order_number}.`,
  })

  revalidatePath(`/pedidos/${params.orderId}`)
}

export async function deleteAttachment(orderId: string, attachmentId: string) {
  const { user, supabase, order } = await assertCanEditOrder(orderId)

  const { data: attachment } = await supabase
    .from("order_attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .single()

  if (!attachment) throw new Error("Anexo não encontrado.")

  await supabase.storage.from("order-attachments").remove([attachment.storage_path])

  const { error } = await supabase.from("order_attachments").delete().eq("id", attachmentId)
  if (error) throw new Error("Não foi possível remover o anexo.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId,
    action: "Pedido atualizado",
    description: `Arquivo "${attachment.file_name}" removido do pedido ${order.erp_order_number}.`,
  })

  revalidatePath(`/pedidos/${orderId}`)
}
