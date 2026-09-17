import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listStatuses } from "@/lib/queries"
import { KanbanBoard, type KanbanOrder } from "@/components/kanban/kanban-board"

export default async function KanbanPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const statuses = await listStatuses(user.companyId)

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, erp_order_number, customer_name, delivery_date, priority, status_id, responsible_user_id, users(name), order_items(count)",
    )
    .eq("company_id", user.companyId)
    .order("priority", { ascending: false })
    .order("delivery_date", { ascending: true, nullsFirst: false })

  const kanbanOrders: KanbanOrder[] = (orders ?? []).map((o) => ({
    id: o.id,
    erpOrderNumber: o.erp_order_number,
    customerName: o.customer_name,
    deliveryDate: o.delivery_date,
    priority: o.priority,
    statusId: o.status_id,
    responsibleUserId: o.responsible_user_id,
    responsibleName: o.users?.name ?? null,
    itemCount: o.order_items?.[0]?.count ?? 0,
  }))

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
