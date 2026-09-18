import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listStatuses } from "@/lib/queries"
import { isBlockedStatusName } from "@/lib/business-rules"
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

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, erp_order_number, customer_name, delivery_date, priority, status_id, responsible_user_id, users(name), order_items(status_id)",
    )
    .eq("company_id", user.companyId)
    .order("priority", { ascending: false })
    .order("delivery_date", { ascending: true, nullsFirst: false })

  const kanbanOrders: KanbanOrder[] = (orders ?? []).map((o) => {
    const items = o.order_items ?? []
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
