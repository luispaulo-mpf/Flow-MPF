"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import {
  updateOrderStatus,
  updateOrderResponsible,
  updateOrderPriority,
  updateOrderDeliveryDate,
} from "@/actions/orders"

type Order = {
  id: string
  erp_order_number: string
  customer_name: string
  issue_date: string | null
  delivery_date: string | null
  total_value: number | null
  priority: string
  status_id: string | null
  responsible_user_id: string | null
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const [y, m, d] = value.split("-")
  return `${d}/${m}/${y}`
}

function formatCurrency(value: number | null) {
  if (value === null) return "—"
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

export function OrderHeader({
  order,
  statuses,
  users,
  canEdit,
}: {
  order: Order
  statuses: { id: string; name: string; color: string }[]
  users: { id: string; name: string }[]
  canEdit: boolean
}) {
  const [, startTransition] = useTransition()

  function run(promise: Promise<void>, successMsg: string) {
    startTransition(async () => {
      try {
        await promise
        toast.success(successMsg)
      } catch {
        toast.error("Não foi possível salvar a alteração.")
      }
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Pedido {order.erp_order_number}
            </h1>
            <p className="text-sm text-slate-500">{order.customer_name}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Emissão</p>
              <p className="text-slate-700">{formatDate(order.issue_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Entrega</p>
              <p className="text-slate-700">{formatDate(order.delivery_date)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Valor</p>
              <p className="text-slate-700">{formatCurrency(order.total_value)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Status</label>
            <select
              defaultValue={order.status_id ?? ""}
              disabled={!canEdit}
              onChange={(e) => run(updateOrderStatus(order.id, e.target.value), "Status atualizado.")}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
            >
              <option value="" disabled>
                Selecione
              </option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Responsável</label>
            <select
              defaultValue={order.responsible_user_id ?? ""}
              disabled={!canEdit}
              onChange={(e) =>
                run(
                  updateOrderResponsible(order.id, e.target.value || null),
                  "Responsável atualizado.",
                )
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
            >
              <option value="">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Prioridade</label>
            <select
              defaultValue={order.priority}
              disabled={!canEdit}
              onChange={(e) =>
                run(updateOrderPriority(order.id, e.target.value), "Prioridade atualizada.")
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
            >
              <option value="LOW">Baixa</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-500">Prazo de entrega</label>
            <input
              type="date"
              defaultValue={order.delivery_date ?? ""}
              disabled={!canEdit}
              onChange={(e) =>
                run(
                  updateOrderDeliveryDate(order.id, e.target.value || null),
                  "Prazo atualizado.",
                )
              }
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
