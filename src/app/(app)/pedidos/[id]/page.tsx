import { notFound } from "next/navigation"
import { requireUser, canEditOrder } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listActiveUsers, listStatuses } from "@/lib/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { OrderHeader } from "./order-header"
import { OrderTasks } from "./order-tasks"
import { OrderComments } from "./order-comments"
import { OrderActivity } from "./order-activity"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, erp_order_number, customer_name, issue_date, delivery_date, total_value, priority, status_id, responsible_user_id, notes, created_at",
    )
    .eq("id", id)
    .eq("company_id", user.companyId)
    .single()

  if (!order) notFound()

  const [{ data: items }, statuses, users, { data: tasks }, { data: comments }, { data: logs }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("id, erp_item_code, description, quantity, unit, status")
        .eq("order_id", id)
        .order("created_at", { ascending: true }),
      listStatuses(user.companyId),
      listActiveUsers(user.companyId),
      supabase
        .from("tasks")
        .select("id, title, status, priority, due_date, responsible_user_id, users:responsible_user_id(name)")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("comments")
        .select("id, content, created_at, users(name)")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_logs")
        .select("id, action, description, created_at, users(name)")
        .eq("order_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ])

  const canEdit = canEditOrder(user.role, order.responsible_user_id, user.id)

  return (
    <div className="flex flex-col gap-4">
      <OrderHeader order={order} statuses={statuses} users={users} canEdit={canEdit} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Itens do pedido</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Qtd.</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(items ?? []).map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-slate-500">{item.erp_item_code ?? "—"}</TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{item.unit ?? "—"}</TableCell>
                        <TableCell>{item.status}</TableCell>
                      </TableRow>
                    ))}
                    {(items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                          Nenhum item cadastrado.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <OrderTasks orderId={order.id} tasks={tasks ?? []} users={users} />

          <OrderComments orderId={order.id} comments={comments ?? []} />
        </div>

        <div className="flex flex-col gap-4">
          {order.notes ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Observações</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 whitespace-pre-wrap">
                {order.notes}
              </CardContent>
            </Card>
          ) : null}
          <OrderActivity logs={logs ?? []} />
        </div>
      </div>
    </div>
  )
}
