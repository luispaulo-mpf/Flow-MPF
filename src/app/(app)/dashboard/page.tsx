import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listStatuses } from "@/lib/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
  isItemFinishedStatusName,
  isItemLate,
  isOrderAtRisk,
  isOrderLate,
  isTaskDueToday,
  isTaskLate,
} from "@/lib/business-rules"
import { buildSegments, formatDuration, summarizeByStatus, summarizeCycle, type HistoryRow } from "@/lib/history"
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

function pct(count: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((count / total) * 100)}%`
}

export default async function DashboardPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [
    { data: company },
    orderStatuses,
    itemStatuses,
    { data: orders },
    { data: tasks },
    { data: orderItems },
    { data: orderStatusHistory },
    { data: orderItemStatusHistory },
  ] = await Promise.all([
    supabase
      .from("companies")
      .select("production_capacity_monthly, risk_window_days")
      .eq("id", user.companyId)
      .single(),
    listStatuses(user.companyId, "ORDER"),
    listStatuses(user.companyId, "ITEM"),
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
    supabase.from("order_items").select("id, order_id, quantity, status_id, delivery_date"),
    supabase.from("order_status_history").select("order_id, status_id, entered_at, statuses(name)"),
    supabase
      .from("order_item_status_history")
      .select("order_item_id, status_id, entered_at, statuses(name)"),
  ])

  const riskWindowDays = company?.risk_window_days ?? 2
  const productionCapacity = company?.production_capacity_monthly ?? 500

  const statusById = new Map((orderStatuses ?? []).map((s) => [s.id, s]))
  const itemStatusById = new Map((itemStatuses ?? []).map((s) => [s.id, s]))
  const allOrders = orders ?? []
  const allTasks = tasks ?? []
  const allItems = orderItems ?? []

  const totalOrders = allOrders.length
  const emAndamento = allOrders.filter((o) => !statusById.get(o.status_id ?? "")?.is_final).length
  const atrasados = allOrders.filter((o) =>
    isOrderLate(o.delivery_date, statusById.get(o.status_id ?? "")?.is_final ?? false),
  ).length
  const bloqueados = allOrders.filter((o) =>
    isBlockedStatusName(statusById.get(o.status_id ?? "")?.name),
  ).length
  const emRisco = allOrders.filter((o) =>
    isOrderAtRisk(o.delivery_date, statusById.get(o.status_id ?? "")?.is_final ?? false, riskWindowDays),
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

  // ---- 1.4 Capacidade de produção ----
  const finishedItemStatusIds = new Set(
    (itemStatuses ?? []).filter((s) => isItemFinishedStatusName(s.name)).map((s) => s.id),
  )
  const orderFinalById = new Map(
    allOrders.map((o) => [o.id, statusById.get(o.status_id ?? "")?.is_final ?? false]),
  )
  const pecasEmProducao = allItems
    .filter(
      (i) =>
        !(i.status_id && finishedItemStatusIds.has(i.status_id)) && !orderFinalById.get(i.order_id),
    )
    .reduce((sum, i) => sum + Number(i.quantity), 0)
  const capacidadePercent =
    productionCapacity > 0 ? Math.round((pecasEmProducao / productionCapacity) * 100) : 0

  // ---- 8.2 Itens atrasados ----
  const itensAtrasadosList = allItems.filter((i) =>
    isItemLate(i.delivery_date, isItemFinishedStatusName(itemStatusById.get(i.status_id ?? "")?.name)),
  )
  const itensAtrasados = itensAtrasadosList.length
  const pedidosComItemAtrasado = new Set(itensAtrasadosList.map((i) => i.order_id)).size

  // ---- 10. Bloqueio por matéria-prima ----
  const awaitingMaterialStatusIds = new Set(
    (itemStatuses ?? []).filter((s) => isBlockedStatusName(s.name)).map((s) => s.id),
  )
  const awaitingItems = allItems.filter((i) => i.status_id && awaitingMaterialStatusIds.has(i.status_id))
  const itensAguardandoMP = awaitingItems.length
  const pedidosComBloqueio = new Set(awaitingItems.map((i) => i.order_id)).size
  const pecasBloqueadas = awaitingItems.reduce((sum, i) => sum + Number(i.quantity), 0)

  const itemSegmentsByItem = new Map<string, HistoryRow[]>()
  for (const row of orderItemStatusHistory ?? []) {
    const list = itemSegmentsByItem.get(row.order_item_id) ?? []
    list.push({ statusId: row.status_id, statusName: row.statuses?.name ?? "", enteredAt: row.entered_at })
    itemSegmentsByItem.set(row.order_item_id, list)
  }
  const allItemSegments = Array.from(itemSegmentsByItem.values()).flatMap((rows) => buildSegments(rows))
  const awaitingSegments = allItemSegments.filter((s) => isBlockedStatusName(s.statusName))
  const avgAwaitingMs =
    awaitingSegments.length > 0
      ? awaitingSegments.reduce((sum, s) => sum + s.durationMs, 0) / awaitingSegments.length
      : null

  // ---- 1.2 / 1.3 Tempo por etapa e ciclo operacional (usam order_status_history) ----
  const orderHistoryByOrder = new Map<string, HistoryRow[]>()
  for (const row of orderStatusHistory ?? []) {
    const list = orderHistoryByOrder.get(row.order_id) ?? []
    list.push({ statusId: row.status_id, statusName: row.statuses?.name ?? "", enteredAt: row.entered_at })
    orderHistoryByOrder.set(row.order_id, list)
  }
  const orderSegmentsById = new Map(
    Array.from(orderHistoryByOrder.entries()).map(([orderId, rows]) => [orderId, buildSegments(rows)]),
  )

  const activeOrderStatuses = (orderStatuses ?? []).filter((s) => s.active)
  const stageStats = summarizeByStatus(
    Array.from(orderSegmentsById.values()),
    activeOrderStatuses.map((s) => ({ id: s.id, name: s.name })),
  )

  const cycleStat = summarizeCycle(
    allOrders.map((o) => ({ id: o.id, segments: orderSegmentsById.get(o.id) ?? [] })),
    (statusId) => statusById.get(statusId)?.is_final ?? false,
  )

  // ---- 8.4 Cumprimento de prazo ----
  const concludedWithDate = allOrders.filter(
    (o) => statusById.get(o.status_id ?? "")?.is_final && o.delivery_date,
  )
  const onTimeCount = concludedWithDate.filter((o) => {
    const segments = orderSegmentsById.get(o.id) ?? []
    const finalSeg = segments.find((s) => statusById.get(s.statusId)?.is_final)
    return finalSeg ? finalSeg.enteredAt.slice(0, 10) <= (o.delivery_date as string) : false
  }).length
  const cumprimentoPercent = concludedWithDate.length > 0 ? pct(onTimeCount, concludedWithDate.length) : null

  const tiles = [
    { label: "Pedidos totais", value: totalOrders, icon: ClipboardList, href: "/pedidos", tone: "text-slate-700" },
    { label: "Em andamento", value: emAndamento, icon: Clock, href: "/pedidos?situacao=andamento", tone: "text-blue-600" },
    {
      label: `Atrasados (${pct(atrasados, totalOrders)})`,
      value: atrasados,
      icon: AlertTriangle,
      href: "/pedidos?situacao=atrasado",
      tone: "text-red-600",
    },
    { label: "Bloqueados", value: bloqueados, icon: Ban, href: "/pedidos?situacao=bloqueado", tone: "text-orange-600" },
    {
      label: `Em risco (${pct(emRisco, totalOrders)})`,
      value: emRisco,
      icon: AlertOctagon,
      href: "/pedidos?situacao=risco",
      tone: "text-amber-600",
    },
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tempo por etapa</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Pedidos agora</TableHead>
                  <TableHead>Tempo médio</TableHead>
                  <TableHead>Mais antigo na etapa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stageStats.map((stage) => (
                  <TableRow key={stage.statusId}>
                    <TableCell className="font-medium">{stage.statusName}</TableCell>
                    <TableCell>{stage.currentCount}</TableCell>
                    <TableCell>{formatDuration(stage.avgDurationMs)}</TableCell>
                    <TableCell>
                      {formatDuration(stage.oldestDurationMs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ciclo operacional</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">Médio (concluídos)</p>
                <p className="font-medium text-slate-800">{formatDuration(cycleStat.avgMs)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Menor</p>
                <p className="font-medium text-slate-800">{formatDuration(cycleStat.minMs)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Maior</p>
                <p className="font-medium text-slate-800">{formatDuration(cycleStat.maxMs)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              {cycleStat.ongoing.length} pedidos em andamento — ciclo acumulado até agora, não é
              previsão de conclusão.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Capacidade de produção</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-slate-600">
              Produção atual: <span className="font-medium text-slate-900">{pecasEmProducao}</span> peças
              {" · "}Capacidade: <span className="font-medium text-slate-900">{productionCapacity}</span>{" "}
              peças/mês
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full ${capacidadePercent >= 100 ? "bg-red-500" : capacidadePercent >= 80 ? "bg-amber-500" : "bg-primary"}`}
                style={{ width: `${Math.min(100, capacidadePercent)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500">Carga: {capacidadePercent}%</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prazos</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-900">{itensAtrasados}</span> itens atrasados em{" "}
              <span className="font-medium text-slate-900">{pedidosComItemAtrasado}</span> pedidos
            </p>
            <p>
              Cumprimento de prazo:{" "}
              <span className="font-medium text-slate-900">{cumprimentoPercent ?? "—"}</span>
              {cumprimentoPercent ? " dos pedidos concluídos" : " (nenhum pedido concluído com prazo ainda)"}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Bloqueio por matéria-prima</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-400">Itens aguardando</p>
              <p className="text-lg font-semibold text-slate-900">{itensAguardandoMP}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Pedidos afetados</p>
              <p className="text-lg font-semibold text-slate-900">{pedidosComBloqueio}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Peças bloqueadas</p>
              <p className="text-lg font-semibold text-slate-900">{pecasBloqueadas}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Tempo médio aguardando</p>
              <p className="text-lg font-semibold text-slate-900">{formatDuration(avgAwaitingMs)}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
