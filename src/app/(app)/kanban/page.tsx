import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listStatuses } from "@/lib/queries"
import {
  isBlockedStatusName,
  isItemFinishedStatusName,
  isThirdPartyStatusName,
  nowMs,
} from "@/lib/business-rules"
import { KanbanBoard, type KanbanOrder } from "@/components/kanban/kanban-board"

export default async function KanbanPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [statuses, itemStatuses] = await Promise.all([
    listStatuses(user.companyId),
    listStatuses(user.companyId, "ITEM"),
  ])

  const awaitingMaterialStatusIds = new Set(
    itemStatuses.filter((s) => isBlockedStatusName(s.name)).map((s) => s.id),
  )
  const thirdPartyStatusIds = new Set(
    itemStatuses.filter((s) => isThirdPartyStatusName(s.name)).map((s) => s.id),
  )
  const finishedItemStatusIds = new Set(
    itemStatuses.filter((s) => isItemFinishedStatusName(s.name)).map((s) => s.id),
  )

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, erp_order_number, customer_name, delivery_date, priority, status_id, responsible_user_id, users(name), order_items(status_id, delivery_date)",
    )
    .eq("company_id", user.companyId)
    .is("archived_at", null)
    .order("priority", { ascending: false })
    .order("delivery_date", { ascending: true, nullsFirst: false })

  const { data: openWaits } = await supabase
    .from("order_client_waits")
    .select("order_id, reason, started_at")
    .eq("company_id", user.companyId)
    .is("ended_at", null)
  const now = nowMs()
  const waitByOrder = new Map(
    (openWaits ?? []).map((w) => [
      w.order_id,
      { reason: w.reason, days: Math.floor((now - new Date(w.started_at).getTime()) / 86_400_000) },
    ]),
  )

  const kanbanOrders: KanbanOrder[] = (orders ?? []).map((o) => {
    const items = o.order_items ?? []
    const itemsByDate = new Map<string, number>()
    for (const item of items) {
      if (!item.delivery_date) continue
      if (item.status_id && finishedItemStatusIds.has(item.status_id)) continue
      itemsByDate.set(item.delivery_date, (itemsByDate.get(item.delivery_date) ?? 0) + 1)
    }
    const deliveries = [...itemsByDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, itemCount]) => ({ date, itemCount }))
    return {
      id: o.id,
      erpOrderNumber: o.erp_order_number,
      customerName: o.customer_name,
      deliveryDate: o.delivery_date,
      priority: o.priority,
      statusId: o.status_id,
      responsibleUserId: o.responsible_user_id,
      responsibleName: o.users?.name ?? null,
      itemCount: items.length,
      awaitingMaterialCount: items.filter(
        (i) => i.status_id && awaitingMaterialStatusIds.has(i.status_id),
      ).length,
      thirdPartyCount: items.filter((i) => i.status_id && thirdPartyStatusIds.has(i.status_id))
        .length,
      deliveries,
      clientWait: waitByOrder.get(o.id) ?? null,
    }
  })

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Kanban de pedidos</h1>
        <p className="text-sm text-slate-500">Arraste os cards para mudar o status do pedido.</p>
      </div>
      <KanbanBoard
        statuses={statuses.filter((s) => s.active)}
        orders={kanbanOrders}
        currentUserId={user.id}
        role={user.role}
      />
    </div>
  )
}
