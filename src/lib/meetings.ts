import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import {
  brDate,
  isBlockedStatusName,
  isItemFinishedStatusName,
  isThirdPartyStatusName,
} from "@/lib/business-rules"

type Client = SupabaseClient<Database>

export const MEETING_AREAS = [
  { key: "PRODUCAO", label: "Produção" },
  { key: "COMPRAS", label: "Compras/Almoxarifado" },
  { key: "ENGENHARIA", label: "Engenharia" },
  { key: "COLETAS", label: "Coletas" },
  { key: "GERAL", label: "Assuntos gerais" },
] as const
export type MeetingArea = (typeof MEETING_AREAS)[number]["key"]
export const MEETING_AREA_LABELS: Record<string, string> = Object.fromEntries(
  MEETING_AREAS.map((a) => [a.key, a.label]),
)

/**
 * One delivery lot: the items of an order that share an ERP delivery date
 * (the item's own date, else the order's). `key` is `orderId|erpDate`.
 */
export type Lot = {
  key: string
  orderId: string
  orderNumber: string
  customerName: string
  /** Day it's shown in the billing: the meeting's forecast, else the ERP date. */
  date: string
  /** ERP (Zoomsoft) delivery date. */
  erpDate: string
  /** Moved to another day in a meeting. */
  rescheduled: boolean
  /** Added to the billing by hand in a meeting. */
  manual: boolean
  /** Taken off the billing in a meeting (still listed, so it can be undone). */
  excluded: boolean
  itemCount: number
  pendingCount: number
  risk: "ok" | "warn" | "done"
  pendingByStage: { name: string; count: number }[]
}

/** Meeting annotation of a lot; the latest one up to a meeting applies. */
export type LotNote = {
  committed: boolean
  reason: string | null
  forecastDate: string | null
  included: boolean
  excluded: boolean
  /** Meeting where it was recorded (may be an earlier one, carried over). */
  meetingDate: string
  fromThisMeeting: boolean
}
export type LateLot = Lot & { daysLate: number }
export type AttentionPoint = {
  key: string
  area: MeetingArea
  title: string
  orderId: string | null
}
export type MeetingAgenda = {
  weeks: { start: string; days: { date: string; lots: Lot[] }[] }[]
  late: LateLot[]
  attention: AttentionPoint[]
}

// ---- Date helpers on YYYY-MM-DD strings (UTC, so no time-zone drift) ----
function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`)
}
function toIso(date: Date) {
  return date.toISOString().slice(0, 10)
}
export function addDays(iso: string, days: number) {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return toIso(d)
}
export function mondayOf(iso: string) {
  const d = toDate(iso)
  const weekday = (d.getUTCDay() + 6) % 7 // Monday = 0
  return addDays(iso, -weekday)
}
export function daysBetween(fromIso: string, toIsoDate: string) {
  return Math.round((toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / 86400000)
}
function formatShort(iso: string) {
  const [, month, day] = iso.split("-")
  return `${day}/${month}`
}

/** Days production needs, with all material available, before a delivery. */
export const RAW_MATERIAL_LEAD_DAYS = 15

/** "Saiu" = the order reached EXPEDIÇÃO (billed) or any later / final status. */
function billedStatusIds(statuses: { id: string; name: string; position: number; is_final: boolean }[]) {
  const expedicao = statuses.find((s) =>
    s.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().includes("EXPEDI"),
  )
  return new Set(
    statuses
      .filter((s) => s.is_final || (expedicao ? s.position >= expedicao.position : false))
      .map((s) => s.id),
  )
}

async function loadProductionData(supabase: Client, companyId: string) {
  const [{ data: orderStatuses }, { data: itemStatuses }, { data: orders }] = await Promise.all([
    supabase
      .from("statuses")
      .select("id, name, position, is_final")
      .eq("company_id", companyId)
      .eq("scope", "ORDER"),
    supabase.from("statuses").select("id, name").eq("company_id", companyId).eq("scope", "ITEM"),
    supabase
      .from("orders")
      .select("id, erp_order_number, customer_name, status_id, delivery_date")
      .eq("company_id", companyId)
      .is("archived_at", null),
  ])
  const orderIds = (orders ?? []).map((o) => o.id)
  const [{ data: items }, { data: openItemTasks }] = orderIds.length
    ? await Promise.all([
        supabase
          .from("order_items")
          .select("id, order_id, status_id, delivery_date, engineering_review")
          .in("order_id", orderIds),
        supabase
          .from("tasks")
          .select("order_item_id")
          .eq("company_id", companyId)
          .neq("status", "DONE")
          .not("order_item_id", "is", null),
      ])
    : [{ data: [] }, { data: [] }]

  return {
    orderStatuses: orderStatuses ?? [],
    itemStatuses: itemStatuses ?? [],
    orders: orders ?? [],
    items: items ?? [],
    itemsWithOpenTasks: new Set((openItemTasks ?? []).map((t) => t.order_item_id as string)),
  }
}

/** ERP delivery date of an item: its own, else the order's. */
function itemDate(item: { delivery_date: string | null }, order: { delivery_date: string | null } | undefined) {
  return item.delivery_date ?? order?.delivery_date ?? null
}

/**
 * Lot annotations that apply to a meeting: for each lot, this meeting's own
 * note, else the latest one from an earlier real meeting (a forecast or
 * reason given last week still holds this week). Test meetings never feed
 * real ones.
 */
export async function loadLotNotes(
  supabase: Client,
  companyId: string,
  meeting: { id: string; meeting_date: string; is_test: boolean },
): Promise<Record<string, LotNote>> {
  const [{ data: rows }, { data: testMeetings }] = await Promise.all([
    supabase
      .from("meeting_order_notes")
      .select(
        "meeting_id, order_id, delivery_date, committed, reason, forecast_date, included, excluded, meetings!inner(meeting_date, company_id)",
      )
      .eq("meetings.company_id", companyId),
    supabase.from("meetings").select("id").eq("company_id", companyId).eq("is_test", true),
  ])
  const testIds = new Set((testMeetings ?? []).map((m) => m.id))
  const notes: Record<string, LotNote> = {}
  for (const row of rows ?? []) {
    const rowDate = (row.meetings as { meeting_date: string } | null)?.meeting_date ?? ""
    const isThis = row.meeting_id === meeting.id
    if (!isThis && (rowDate > meeting.meeting_date || (!meeting.is_test && testIds.has(row.meeting_id)))) continue
    const key = `${row.order_id}|${row.delivery_date}`
    const current = notes[key]
    if (isThis || !current || (!current.fromThisMeeting && rowDate > current.meetingDate)) {
      notes[key] = {
        committed: row.committed,
        reason: row.reason,
        forecastDate: row.forecast_date,
        included: row.included,
        excluded: row.excluded,
        meetingDate: rowDate,
        fromThisMeeting: isThis,
      }
    }
  }
  return notes
}

/** Live agenda for a meeting held on `meetingDate` (the week's Monday, usually). */
export async function computeAgenda(
  supabase: Client,
  companyId: string,
  meetingDate: string,
  notes: Record<string, LotNote> = {},
): Promise<MeetingAgenda> {
  const data = await loadProductionData(supabase, companyId)
  const billed = billedStatusIds(data.orderStatuses)
  const itemStatusName = new Map(data.itemStatuses.map((s) => [s.id, s.name]))
  const orderById = new Map(data.orders.map((o) => [o.id, o]))

  const isPending = (i: { status_id: string | null }) =>
    !isItemFinishedStatusName(itemStatusName.get(i.status_id ?? ""))

  // ---- Delivery lots (item date, else order date) ----
  const lotItems = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const date = itemDate(item, orderById.get(item.order_id))
    if (!date) continue
    const key = `${item.order_id}|${date}`
    if (!lotItems.has(key)) lotItems.set(key, [])
    lotItems.get(key)!.push(item)
  }
  // Orders added to the billing by hand in a meeting: all of their items.
  for (const [key, note] of Object.entries(notes)) {
    if (!note.included || lotItems.has(key)) continue
    const orderId = key.split("|")[0]
    const items = data.items.filter((i) => i.order_id === orderId)
    if (orderById.has(orderId) && items.length > 0) lotItems.set(key, items)
  }

  const lots: Lot[] = []
  for (const [key, items] of lotItems) {
    const order = orderById.get(items[0].order_id)
    if (!order) continue
    const erpDate = key.split("|")[1]
    const note = notes[key]
    const orderBilled = billed.has(order.status_id ?? "")
    const pending = orderBilled ? [] : items.filter(isPending)
    const stageCounts = new Map<string, number>()
    for (const i of pending) {
      const name = itemStatusName.get(i.status_id ?? "") ?? "Sem etapa"
      stageCounts.set(name, (stageCounts.get(name) ?? 0) + 1)
    }
    const warn = pending.some((i) => {
      const name = itemStatusName.get(i.status_id ?? "")
      return !name || isBlockedStatusName(name) || isThirdPartyStatusName(name)
    })
    const date = note?.forecastDate ?? erpDate
    lots.push({
      key,
      orderId: order.id,
      orderNumber: order.erp_order_number,
      customerName: order.customer_name,
      date,
      erpDate,
      rescheduled: date !== erpDate,
      manual: Boolean(note?.included),
      excluded: Boolean(note?.excluded),
      itemCount: items.length,
      pendingCount: pending.length,
      risk: pending.length === 0 ? "done" : warn ? "warn" : "ok",
      pendingByStage: [...stageCounts.entries()].map(([name, count]) => ({ name, count })),
    })
  }
  lots.sort((a, b) => a.customerName.localeCompare(b.customerName))

  // ---- Billing: this week and next, Monday to Friday (weekend -> Friday) ----
  const weekStart = mondayOf(meetingDate)
  const weeks = [weekStart, addDays(weekStart, 7)].map((start) => {
    const days = [0, 1, 2, 3, 4].map((i) => ({ date: addDays(start, i), lots: [] as Lot[] }))
    for (const lot of lots) {
      const offset = daysBetween(start, lot.date)
      if (offset < 0 || offset > 6) continue
      days[Math.min(offset, 4)].lots.push(lot)
    }
    return { start, days }
  })

  // ---- Late: ERP date before the meeting and still not out ----
  const late: LateLot[] = lots
    .filter((l) => !l.manual && l.pendingCount > 0 && l.erpDate < meetingDate)
    .map((l) => ({ ...l, daysLate: daysBetween(l.erpDate, meetingDate) }))
    .sort((a, b) => b.daysLate - a.daysLate)

  // ---- Attention points (orders not billed yet) ----
  const byOrder = <T extends { order_id: string }>(rows: T[]) => {
    const map = new Map<string, number>()
    for (const r of rows) map.set(r.order_id, (map.get(r.order_id) ?? 0) + 1)
    return map
  }
  const activeItems = data.items.filter((i) => {
    const order = orderById.get(i.order_id)
    return order && !billed.has(order.status_id ?? "") && isPending(i)
  })
  const label = (orderId: string) => {
    const o = orderById.get(orderId)!
    return `${o.customer_name} · ${o.erp_order_number}`
  }
  const plural = (n: number) => (n === 1 ? "item" : "itens")

  // Coletas are informed manually in the meeting, never generated here.
  const attention: AttentionPoint[] = []

  // Raw material only matters once delivery is within the production lead
  // time: production needs RAW_MATERIAL_LEAD_DAYS with all material in hand.
  const materialDeadline = addDays(meetingDate, RAW_MATERIAL_LEAD_DAYS)
  const awaitingMaterial = activeItems
    .filter((i) => isBlockedStatusName(itemStatusName.get(i.status_id ?? "")))
    .map((i) => ({ ...i, due: i.delivery_date ?? orderById.get(i.order_id)?.delivery_date ?? null }))
    .filter((i) => i.due !== null && i.due <= materialDeadline)
  for (const [orderId, n] of byOrder(awaitingMaterial)) {
    const due = awaitingMaterial
      .filter((i) => i.order_id === orderId)
      .map((i) => i.due as string)
      .sort()[0]
    const days = daysBetween(meetingDate, due)
    const when =
      days < 0 ? `entrega ${formatShort(due)}, já vencida` : `entrega ${formatShort(due)} (${days} ${days === 1 ? "dia" : "dias"})`
    attention.push({
      key: `COMPRAS|${orderId}`,
      area: "COMPRAS",
      title: `${label(orderId)}: ${n} ${plural(n)} aguardando matéria-prima · ${when}`,
      orderId,
    })
  }
  for (const [orderId, n] of byOrder(
    activeItems.filter(
      (i) =>
        (i.engineering_review === "NECESSITA_PROJETO" || i.engineering_review === "NECESSITA_REVISAO") &&
        data.itemsWithOpenTasks.has(i.id),
    ),
  )) {
    attention.push({
      key: `ENGENHARIA|${orderId}`,
      area: "ENGENHARIA",
      title: `${label(orderId)}: ${n} ${plural(n)} com projeto ou revisão pendente`,
      orderId,
    })
  }
  const areaOrder = MEETING_AREAS.map((a) => a.key as string)
  attention.sort(
    (a, b) => areaOrder.indexOf(a.area) - areaOrder.indexOf(b.area) || a.title.localeCompare(b.title),
  )

  return { weeks, late, attention }
}

export type LotOutcome = "on_time" | "late_done" | "pending"

/**
 * How each delivery lot ended up: out on/before its date, out late, or not
 * out yet. "Out" = order entered EXPEDIÇÃO (or later), or every item of the
 * lot reached a finished item status (partial shipments).
 */
export async function lotOutcomes(supabase: Client, companyId: string) {
  const data = await loadProductionData(supabase, companyId)
  const billed = billedStatusIds(data.orderStatuses)
  const finishedItemStatusIds = new Set(
    data.itemStatuses.filter((s) => isItemFinishedStatusName(s.name)).map((s) => s.id),
  )
  const orderIds = data.orders.map((o) => o.id)
  const itemIds = data.items.map((i) => i.id)
  const [{ data: orderHistory }, { data: itemHistory }] = await Promise.all([
    orderIds.length
      ? supabase.from("order_status_history").select("order_id, status_id, entered_at").in("order_id", orderIds)
      : Promise.resolve({ data: [] as { order_id: string; status_id: string; entered_at: string }[] }),
    itemIds.length
      ? supabase
          .from("order_item_status_history")
          .select("order_item_id, status_id, entered_at")
          .in("order_item_id", itemIds)
      : Promise.resolve({ data: [] as { order_item_id: string; status_id: string; entered_at: string }[] }),
  ])

  const billedAt = new Map<string, string>()
  for (const h of orderHistory ?? []) {
    if (!billed.has(h.status_id)) continue
    const current = billedAt.get(h.order_id)
    if (!current || h.entered_at < current) billedAt.set(h.order_id, h.entered_at)
  }
  const finishedAt = new Map<string, string>()
  for (const h of itemHistory ?? []) {
    if (!finishedItemStatusIds.has(h.status_id)) continue
    const current = finishedAt.get(h.order_item_id)
    if (!current || h.entered_at < current) finishedAt.set(h.order_item_id, h.entered_at)
  }
  const orderById = new Map(data.orders.map((o) => [o.id, o]))

  const lotItems = new Map<string, typeof data.items>()
  for (const item of data.items) {
    const date = itemDate(item, orderById.get(item.order_id))
    if (!date) continue
    const key = `${item.order_id}|${date}`
    if (!lotItems.has(key)) lotItems.set(key, [])
    lotItems.get(key)!.push(item)
  }

  const outcomes = new Map<string, LotOutcome>()
  for (const [key, items] of lotItems) {
    const order = orderById.get(items[0].order_id)
    const date = key.split("|")[1]
    let outAt: string | null = null
    if (order && billed.has(order.status_id ?? "")) outAt = billedAt.get(order.id) ?? null
    const allFinished = items.every((i) => finishedItemStatusIds.has(i.status_id ?? ""))
    if (allFinished) {
      const lastFinish = items.map((i) => finishedAt.get(i.id) ?? "").sort().at(-1) || null
      if (lastFinish && (!outAt || lastFinish < outAt)) outAt = lastFinish
    }
    const isOut = (order && billed.has(order.status_id ?? "")) || allFinished
    if (!isOut) outcomes.set(key, "pending")
    else outcomes.set(key, outAt && brDate(outAt) > date ? "late_done" : "on_time")
  }
  return outcomes
}
