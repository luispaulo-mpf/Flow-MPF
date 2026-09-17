"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { mapHeaders, parseDate, parseNumber, parseSpreadsheet } from "@/lib/import/parse"
import { extractPdfText, isPedidosReportText, parsePedidosReport } from "@/lib/import/parse-pdf"
import type { ImportOrderGroup, ImportPreview } from "@/lib/import/types"

export type PreviewState = { preview: ImportPreview | null; error: string | null }
export type ConfirmState = { success: boolean; error: string | null; summary: string | null }

export async function previewImport(
  _prev: PreviewState,
  formData: FormData,
): Promise<PreviewState> {
  const user = await requireUser()
  if (!canManageOperations(user.role)) {
    return { preview: null, error: "Você não tem permissão para importar pedidos." }
  }

  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return { preview: null, error: "Selecione um arquivo XLSX, CSV ou PDF." }
  }

  const buffer = await file.arrayBuffer()
  const supabase = await createClient()
  const { data: existingOrders } = await supabase
    .from("orders")
    .select("erp_order_number")
    .eq("company_id", user.companyId)

  const existingSet = new Set((existingOrders ?? []).map((o) => o.erp_order_number))

  if (file.name.toLowerCase().endsWith(".pdf")) {
    let text: string
    try {
      text = await extractPdfText(buffer)
    } catch {
      return { preview: null, error: "Não foi possível ler o PDF. Verifique o arquivo." }
    }

    if (!isPedidosReportText(text)) {
      return {
        preview: null,
        error:
          "Este PDF não parece ser o relatório \"Listagem de Pedidos\" do ERP. Exporte a listagem de pedidos por data de entrega e envie novamente.",
      }
    }

    const { orders, rowErrors } = parsePedidosReport(text)
    const orderedGroups = orders.map((o) => ({
      ...o,
      kind: (existingSet.has(o.erpOrderNumber) ? "ATUALIZADO" : "NOVO") as "NOVO" | "ATUALIZADO",
    }))

    if (orderedGroups.length === 0) {
      return { preview: null, error: "Nenhum pedido reconhecido neste PDF." }
    }

    return {
      preview: { fileName: file.name, orders: orderedGroups, rowErrors },
      error: null,
    }
  }

  let headers: string[]
  let rows: unknown[][]

  try {
    ;({ headers, rows } = await parseSpreadsheet(buffer, file.name))
  } catch {
    return { preview: null, error: "Não foi possível ler o arquivo. Verifique o formato." }
  }

  if (headers.length === 0 || rows.length === 0) {
    return { preview: null, error: "Arquivo vazio ou sem dados." }
  }

  const { mapping, missing } = mapHeaders(headers)
  if (missing.length > 0) {
    return {
      preview: null,
      error: `Colunas obrigatórias não encontradas: ${missing.join(", ")}.`,
    }
  }

  const groups = new Map<string, ImportOrderGroup>()
  const rowErrors: string[] = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2
    const get = (field: string) => {
      const idx = mapping[field]
      return idx === undefined ? undefined : row[idx]
    }

    const erpOrderNumber = String(get("pedido") ?? "").trim()
    const customerName = String(get("cliente") ?? "").trim()
    const description = String(get("itemDescricao") ?? "").trim()

    if (!erpOrderNumber || !customerName || !description) {
      rowErrors.push(`Linha ${rowNumber}: pedido, cliente e descrição do item são obrigatórios.`)
      return
    }

    const quantity = parseNumber(get("quantidade")) ?? 0
    const itemCode = get("itemCodigo") ? String(get("itemCodigo")).trim() : null
    const unit = get("unidade") ? String(get("unidade")).trim() : null

    if (!groups.has(erpOrderNumber)) {
      groups.set(erpOrderNumber, {
        erpOrderNumber,
        customerName,
        issueDate: parseDate(get("dataEmissao")),
        deliveryDate: parseDate(get("dataEntrega")),
        totalValue: parseNumber(get("valor")),
        items: [],
        kind: existingSet.has(erpOrderNumber) ? "ATUALIZADO" : "NOVO",
        errors: [],
      })
    }

    groups.get(erpOrderNumber)!.items.push({ itemCode, description, quantity, unit })
  })

  const preview: ImportPreview = {
    fileName: file.name,
    orders: Array.from(groups.values()),
    rowErrors,
  }

  return { preview, error: null }
}

export async function confirmImport(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const user = await requireUser()
  if (!canManageOperations(user.role)) {
    return { success: false, error: "Você não tem permissão para importar pedidos.", summary: null }
  }

  const raw = String(formData.get("payload") ?? "")
  if (!raw) return { success: false, error: "Nada para importar.", summary: null }

  let orders: ImportOrderGroup[]
  try {
    orders = JSON.parse(raw) as ImportOrderGroup[]
  } catch {
    return { success: false, error: "Dados de importação inválidos.", summary: null }
  }

  const supabase = await createClient()

  const { data: defaultStatus } = await supabase
    .from("statuses")
    .select("id")
    .eq("company_id", user.companyId)
    .eq("scope", "ORDER")
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: defaultItemStatus } = await supabase
    .from("statuses")
    .select("id")
    .eq("company_id", user.companyId)
    .eq("scope", "ITEM")
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle()

  let novos = 0
  let atualizados = 0
  let falhas = 0

  for (const group of orders) {
    const { data: order, error } = await supabase
      .from("orders")
      .upsert(
        {
          company_id: user.companyId,
          erp_order_number: group.erpOrderNumber,
          customer_name: group.customerName,
          issue_date: group.issueDate,
          delivery_date: group.deliveryDate,
          total_value: group.totalValue,
          // Only stamp a default status on brand-new orders; never overwrite
          // the status of an order someone has already triaged on the Kanban.
          ...(group.kind === "NOVO" && defaultStatus ? { status_id: defaultStatus.id } : {}),
        },
        { onConflict: "company_id,erp_order_number" },
      )
      .select("id")
      .single()

    if (error || !order) {
      falhas += 1
      continue
    }

    await supabase.from("order_items").delete().eq("order_id", order.id)
    if (group.items.length > 0) {
      await supabase.from("order_items").insert(
        group.items.map((item) => ({
          order_id: order.id,
          erp_item_code: item.itemCode,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          status_id: defaultItemStatus?.id ?? null,
        })),
      )
    }

    await logActivity(supabase, {
      companyId: user.companyId,
      userId: user.id,
      orderId: order.id,
      action: "Pedido importado",
      description: `Pedido ${group.erpOrderNumber} importado (${group.items.length} itens) via ${group.kind === "NOVO" ? "criação" : "atualização"}.`,
    })

    if (group.kind === "NOVO") novos += 1
    else atualizados += 1
  }

  revalidatePath("/pedidos")
  revalidatePath("/kanban")
  revalidatePath("/dashboard")

  return {
    success: true,
    error: null,
    summary: `${novos} pedidos novos, ${atualizados} atualizados${falhas ? `, ${falhas} falharam` : ""}.`,
  }
}
