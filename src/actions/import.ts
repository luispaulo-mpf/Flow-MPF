"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { mapHeaders, parseDate, parseNumber, parseSpreadsheet } from "@/lib/import/parse"
import { extractPdfText, isPedidosReportText, parsePedidosReport } from "@/lib/import/parse-pdf"
import { isPedidoPorItemReportText, parsePedidoPorItemReport } from "@/lib/import/parse-pedido-pdf"
import type { ImportOrderGroup, ImportPreview, ImportReportType } from "@/lib/import/types"

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
    } catch (e) {
      // TEMP diagnostics again: DOMMatrix fix wasn't the whole story in prod.
      const detail = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e)
      return { preview: null, error: `Não foi possível ler o PDF. [DEBUG] ${detail}` }
    }

    let reportType: ImportReportType
    let parsed: { orders: ImportOrderGroup[]; rowErrors: string[] }

    if (isPedidoPorItemReportText(text)) {
      reportType = "PRODUTOS_POR_PEDIDO"
      parsed = parsePedidoPorItemReport(text)
    } else if (isPedidosReportText(text)) {
      reportType = "PRODUTOS_POR_DATA_ENTREGA"
      parsed = parsePedidosReport(text)
    } else {
      return {
        preview: null,
        error:
          "Este PDF não parece ser um relatório \"Listagem de Pedidos\" reconhecido do ERP. Exporte a listagem de pedidos por data de entrega ou por pedido e envie novamente.",
      }
    }

    const orderedGroups = parsed.orders.map((o) => ({
      ...o,
      kind: (existingSet.has(o.erpOrderNumber) ? "ATUALIZADO" : "NOVO") as "NOVO" | "ATUALIZADO",
    }))

    if (orderedGroups.length === 0) {
      return { preview: null, error: "Nenhum pedido reconhecido neste PDF." }
    }

    return {
      preview: { fileName: file.name, reportType, orders: orderedGroups, rowErrors: parsed.rowErrors },
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
    reportType: "SPREADSHEET",
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

  let reportType: ImportReportType
  let orders: ImportOrderGroup[]
  try {
    const payload = JSON.parse(raw) as { reportType: ImportReportType; orders: ImportOrderGroup[] }
    reportType = payload.reportType
    orders = payload.orders
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

  if (reportType === "PRODUTOS_POR_PEDIDO") {
    // This report only carries real per-item delivery dates. For orders that
    // already exist we must not touch their existing fields/items — we only
    // reconcile item delivery_date, and add items the report knows about
    // that aren't in the database yet (split-shipment rows).
    for (const group of orders) {
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("company_id", user.companyId)
        .eq("erp_order_number", group.erpOrderNumber)
        .maybeSingle()

      let orderId = existingOrder?.id ?? null

      if (!orderId) {
        const { data: created, error } = await supabase
          .from("orders")
          .insert({
            company_id: user.companyId,
            erp_order_number: group.erpOrderNumber,
            customer_name: group.customerName,
            issue_date: group.issueDate,
            delivery_date: group.deliveryDate,
            status_id: defaultStatus?.id ?? null,
          })
          .select("id")
          .single()

        if (error || !created) {
          falhas += 1
          continue
        }
        orderId = created.id
        novos += 1
      } else {
        atualizados += 1
      }

      const { data: existingItems } = await supabase
        .from("order_items")
        .select("id, erp_item_code, delivery_date")
        .eq("order_id", orderId)

      const remainingByCode = new Map<string, { id: string; delivery_date: string | null }[]>()
      for (const item of existingItems ?? []) {
        const key = item.erp_item_code ?? ""
        if (!remainingByCode.has(key)) remainingByCode.set(key, [])
        remainingByCode.get(key)!.push({ id: item.id, delivery_date: item.delivery_date })
      }

      let itemsTouched = 0
      for (const reportItem of group.items) {
        const key = reportItem.itemCode ?? ""
        const bucket = remainingByCode.get(key) ?? []
        const match = bucket.shift()

        if (match) {
          if (match.delivery_date !== reportItem.deliveryDate) {
            await supabase
              .from("order_items")
              .update({ delivery_date: reportItem.deliveryDate ?? null })
              .eq("id", match.id)
          }
        } else {
          await supabase.from("order_items").insert({
            order_id: orderId,
            erp_item_code: reportItem.itemCode,
            description: reportItem.description,
            quantity: reportItem.quantity,
            unit: reportItem.unit,
            delivery_date: reportItem.deliveryDate ?? null,
            status_id: defaultItemStatus?.id ?? null,
          })
        }
        itemsTouched += 1
      }

      await logActivity(supabase, {
        companyId: user.companyId,
        userId: user.id,
        orderId,
        action: "Pedido importado",
        description: `Pedido ${group.erpOrderNumber}: datas de entrega de ${itemsTouched} itens reconciliadas via relatório "Produtos por pedido".`,
      })
    }

    revalidatePath("/pedidos")
    revalidatePath("/kanban")
    revalidatePath("/dashboard")

    return {
      success: true,
      error: null,
      summary: `${novos} pedidos novos, ${atualizados} com datas de item reconciliadas${falhas ? `, ${falhas} falharam` : ""}.`,
    }
  }

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
