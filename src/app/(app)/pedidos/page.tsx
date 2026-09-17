import Link from "next/link"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listActiveUsers, listStatuses } from "@/lib/queries"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PriorityBadge } from "@/components/domain/priority-badge"
import { StatusBadge } from "@/components/domain/status-badge"
import { DeliveryDate } from "@/components/domain/delivery-date"
import { Plus } from "lucide-react"
import { isBlockedStatusName, isOrderAtRisk, isOrderLate } from "@/lib/business-rules"

const PAGE_SIZE = 20

type OrderRow = {
  id: string
  erp_order_number: string
  customer_name: string
  delivery_date: string | null
  priority: string
  status_id: string | null
  responsible_user_id: string | null
  statuses: { name: string; color: string; is_final: boolean } | null
  users: { name: string } | null
}

const SITUACAO_LABELS: Record<string, string> = {
  andamento: "Em andamento",
  atrasado: "Atrasados",
  bloqueado: "Bloqueados",
  risco: "Em risco",
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? "1") || 1)
  const q = params.q?.trim() ?? ""
  const situacao = params.situacao ?? ""

  const supabase = await createClient()
  const [statuses, users] = await Promise.all([
    listStatuses(user.companyId),
    listActiveUsers(user.companyId),
  ])

  let query = supabase
    .from("orders")
    .select(
      "id, erp_order_number, customer_name, delivery_date, priority, status_id, responsible_user_id, statuses(name, color, is_final), users(name)",
      { count: situacao ? undefined : "exact" },
    )
    .eq("company_id", user.companyId)

  if (q) {
    query = query.or(`erp_order_number.ilike.%${q}%,customer_name.ilike.%${q}%`)
  }
  if (params.status) query = query.eq("status_id", params.status)
  if (params.responsavel) query = query.eq("responsible_user_id", params.responsavel)
  if (params.prioridade) query = query.eq("priority", params.prioridade)

  query = query.order("delivery_date", { ascending: true, nullsFirst: false })

  let orders: OrderRow[] = []
  let count = 0
  let totalPages = 1

  if (situacao) {
    const { data } = await query
    const matches = ((data ?? []) as unknown as OrderRow[]).filter((o) => {
      const isFinal = o.statuses?.is_final ?? false
      if (situacao === "andamento") return !isFinal
      if (situacao === "atrasado") return isOrderLate(o.delivery_date, isFinal)
      if (situacao === "risco") return isOrderAtRisk(o.delivery_date, isFinal)
      if (situacao === "bloqueado") return isBlockedStatusName(o.statuses?.name)
      return true
    })
    count = matches.length
    totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
    const from = (page - 1) * PAGE_SIZE
    orders = matches.slice(from, from + PAGE_SIZE)
  } else {
    const from = (page - 1) * PAGE_SIZE
    const { data, count: exactCount } = await query.range(from, from + PAGE_SIZE - 1)
    orders = (data ?? []) as unknown as OrderRow[]
    count = exactCount ?? 0
    totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  }

  const canCreate = user.role === "ADMIN" || user.role === "GESTOR"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Pedidos{situacao ? ` · ${SITUACAO_LABELS[situacao] ?? situacao}` : ""}
          </h1>
          <p className="text-sm text-slate-500">{count} pedidos encontrados</p>
        </div>
        {canCreate ? (
          <Button asChild size="sm">
            <Link href="/pedidos/novo">
              <Plus className="size-4" />
              Novo pedido
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
            {situacao ? <input type="hidden" name="situacao" value={situacao} /> : null}
            <Input
              name="q"
              defaultValue={q}
              placeholder="Buscar por número ou cliente"
              className="lg:col-span-2"
            />
            <select
              name="status"
              defaultValue={params.status ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todos os status</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              name="responsavel"
              defaultValue={params.responsavel ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todos os responsáveis</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <select
              name="prioridade"
              defaultValue={params.prioridade ?? ""}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Todas as prioridades</option>
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
            <Button type="submit" variant="secondary" className="lg:col-span-5 sm:w-fit">
              Filtrar
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prioridade</TableHead>
                  <TableHead>Entrega</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell className="font-medium">
                      <Link href={`/pedidos/${order.id}`} className="block">
                        {order.erp_order_number}
                      </Link>
                    </TableCell>
                    <TableCell>{order.customer_name}</TableCell>
                    <TableCell>
                      {order.statuses ? (
                        <StatusBadge name={order.statuses.name} color={order.statuses.color} />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{order.users?.name ?? "—"}</TableCell>
                    <TableCell>
                      <PriorityBadge priority={order.priority} />
                    </TableCell>
                    <TableCell>
                      <DeliveryDate
                        date={order.delivery_date}
                        isFinalStatus={order.statuses?.is_final ?? false}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                {orders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                      Nenhum pedido encontrado.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button key={p} asChild size="sm" variant={p === page ? "default" : "outline"}>
              <Link
                href={{
                  pathname: "/pedidos",
                  query: { ...params, page: p },
                }}
              >
                {p}
              </Link>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
