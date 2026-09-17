import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/domain/status-badge"
import { PriorityBadge } from "@/components/domain/priority-badge"
import {
  alertReason,
  isBlockedStatusName,
  isOrderAtRisk,
  isOrderLate,
  isTaskDueToday,
  isTaskLate,
} from "@/lib/business-rules"
import {
  ClipboardList,
  Clock,
  AlertTriangle,
  Ban,
  ListChecks,
  CalendarClock,
  AlertOctagon,
  Plus,
  UploadCloud,
} from "lucide-react"

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: statuses }, { data: orders }, { data: tasks }] = await Promise.all([
    supabase
      .from("statuses")
      .select("id, name, color, is_final")
      .eq("company_id", user.companyId),
    supabase
      .from("orders")
      .select(
        "id, erp_order_number, customer_name, delivery_date, status_id, responsible_user_id, users(name)",
      )
      .eq("company_id", user.companyId),
    supabase
      .from("tasks")
      .select("id, title, due_date, status")
      .eq("company_id", user.companyId)
      .neq("status", "DONE"),
  ])

  const statusById = new Map((statuses ?? []).map((s) => [s.id, s]))
  const allOrders = orders ?? []
  const allTasks = tasks ?? []

  const totalOrders = allOrders.length
  const emAndamento = allOrders.filter((o) => !statusById.get(o.status_id ?? "")?.is_final).length
  const atrasados = allOrders.filter((o) =>
    isOrderLate(o.delivery_date, statusById.get(o.status_id ?? "")?.is_final ?? false),
  ).length
  const bloqueados = allOrders.filter((o) =>
    isBlockedStatusName(statusById.get(o.status_id ?? "")?.name),
  ).length
  const emRisco = allOrders.filter((o) =>
    isOrderAtRisk(o.delivery_date, statusById.get(o.status_id ?? "")?.is_final ?? false),
  ).length

  const tarefasAbertas = allTasks.length
  const tarefasHoje = allTasks.filter((t) => isTaskDueToday(t.due_date, t.status)).length
  const tarefasAtrasadas = allTasks.filter((t) => isTaskLate(t.due_date, t.status)).length

  const atencao = allOrders
    .map((o) => {
      const status = statusById.get(o.status_id ?? "")
      const reason = alertReason({
        deliveryDate: o.delivery_date,
        isFinalStatus: status?.is_final ?? false,
        isBlockedStatus: isBlockedStatusName(status?.name),
      })
      return { order: o, status, reason }
    })
    .filter((x) => x.reason !== null)
    .sort((a, b) => (a.order.delivery_date ?? "9999").localeCompare(b.order.delivery_date ?? "9999"))
    .slice(0, 15)

  const tiles = [
    { label: "Pedidos totais", value: totalOrders, icon: ClipboardList, href: "/pedidos", tone: "text-slate-700" },
    { label: "Em andamento", value: emAndamento, icon: Clock, href: "/pedidos?situacao=andamento", tone: "text-blue-600" },
    { label: "Atrasados", value: atrasados, icon: AlertTriangle, href: "/pedidos?situacao=atrasado", tone: "text-red-600" },
    { label: "Bloqueados", value: bloqueados, icon: Ban, href: "/pedidos?situacao=bloqueado", tone: "text-orange-600" },
    { label: "Em risco", value: emRisco, icon: AlertOctagon, href: "/pedidos?situacao=risco", tone: "text-amber-600" },
    { label: "Tarefas abertas", value: tarefasAbertas, icon: ListChecks, href: "/tarefas?tab=todas", tone: "text-slate-700" },
    { label: "Tarefas hoje", value: tarefasHoje, icon: CalendarClock, href: "/tarefas?tab=minhas", tone: "text-blue-600" },
    { label: "Tarefas atrasadas", value: tarefasAtrasadas, icon: AlertTriangle, href: "/tarefas?tab=minhas", tone: "text-red-600" },
  ]

  const canCreate = user.role === "ADMIN" || user.role === "GESTOR" || user.role === "RESPONSAVEL"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Olá, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-slate-500">O que precisa da sua atenção hoje.</p>
        </div>
        {canCreate ? (
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/pedidos/novo">
                <Plus className="size-4" />
                Novo pedido
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/tarefas?nova=1">
                <Plus className="size-4" />
                Nova tarefa
              </Link>
            </Button>
            {user.role !== "RESPONSAVEL" ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/importar">
                  <UploadCloud className="size-4" />
                  Importar ERP
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex items-center justify-between">
                  <tile.icon className={`size-4 ${tile.tone}`} />
                </div>
                <span className="text-2xl font-semibold text-slate-900">{tile.value}</span>
                <span className="text-xs text-slate-500">{tile.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Pedidos que exigem atenção</h2>
            <span className="text-xs text-slate-500">{atencao.length} pedidos</span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atencao.map(({ order, status, reason }) => (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell className="font-medium">
                      <Link href={`/pedidos/${order.id}`}>{order.erp_order_number}</Link>
                    </TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>{order.users?.name ?? "—"}</TableCell>
                    <TableCell>
                      {order.delivery_date
                        ? order.delivery_date.split("-").reverse().join("/")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {status ? <StatusBadge name={status.name} color={status.color} /> : "—"}
                    </TableCell>
                    <TableCell>
                      <PriorityBadge
                        priority={reason === "Entrega atrasada" ? "URGENT" : "HIGH"}
                        className="whitespace-nowrap"
                      />
                      <span className="ml-2 text-sm text-slate-600">{reason}</span>
                    </TableCell>
                  </TableRow>
                ))}
                {atencao.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      Nenhum pedido exige atenção no momento.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
