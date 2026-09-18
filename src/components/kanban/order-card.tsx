"use client"

import Link from "next/link"
import { Package } from "lucide-react"
import { PriorityBadge } from "@/components/domain/priority-badge"
import { DeliveryDate } from "@/components/domain/delivery-date"
import type { KanbanOrder } from "./kanban-board"

export function OrderCard({
  order,
  isFinalStatus,
  dragging,
}: {
  order: KanbanOrder
  isFinalStatus: boolean
  dragging?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-shadow ${
        dragging ? "opacity-60 shadow-md" : "hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/pedidos/${order.id}`}
          onPointerDown={(e) => e.stopPropagation()}
          className="text-sm font-semibold text-slate-900 hover:underline"
        >
          {order.erpOrderNumber}
        </Link>
        <PriorityBadge priority={order.priority} className="shrink-0" />
      </div>
      <p className="line-clamp-1 text-sm text-slate-600">{order.customerName}</p>
      <div className="flex items-center gap-1 text-xs text-slate-500">
        <Package className="size-3.5" />
        {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
      </div>
      {order.awaitingMaterialCount > 0 ? (
        <p className="text-xs font-medium text-amber-600">
          ⚠ {order.awaitingMaterialCount === order.itemCount
            ? `Todos os ${order.itemCount} itens aguardando matéria prima`
            : `${order.awaitingMaterialCount} de ${order.itemCount} itens aguardando matéria prima`}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <DeliveryDate date={order.deliveryDate} isFinalStatus={isFinalStatus} />
        <span className="truncate text-xs text-slate-500">
          {order.responsibleName ?? "Sem responsável"}
        </span>
      </div>
    </div>
  )
}
