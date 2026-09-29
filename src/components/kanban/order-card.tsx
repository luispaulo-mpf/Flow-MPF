"use client"

import Link from "next/link"
import { CalendarClock, Factory, Package } from "lucide-react"
import { PriorityBadge } from "@/components/domain/priority-badge"
import { DeliveryDate } from "@/components/domain/delivery-date"
import { isOrderAtRisk, isOrderLate } from "@/lib/business-rules"
import { cn } from "@/lib/utils"
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
      className={`flex flex-col gap-2 rounded-lg border border-slate-200 bg-card p-3 shadow-sm transition-shadow ${
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <Package className="size-3.5" />
          {order.itemCount} {order.itemCount === 1 ? "item" : "itens"}
        </div>
        {order.thirdPartyCount > 0 ? (
          <span
            title={`${order.thirdPartyCount} ${order.thirdPartyCount === 1 ? "item" : "itens"} em terceiros`}
            className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-medium text-violet-700"
          >
            <Factory className="size-3.5" />
            {order.thirdPartyCount} em terceiros
          </span>
        ) : null}
      </div>
      {order.awaitingMaterialCount > 0 ? (
        <p className="text-xs font-medium text-amber-600">
          ⚠ {order.awaitingMaterialCount === order.itemCount
            ? `Todos os ${order.itemCount} itens aguardando matéria prima`
            : `${order.awaitingMaterialCount} de ${order.itemCount} itens aguardando matéria prima`}
        </p>
      ) : null}
      {order.deliveries.length > 1 ? (
        <SplitDeliveries deliveries={order.deliveries} isFinalStatus={isFinalStatus} />
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {order.deliveries.length > 1 ? (
          <span />
        ) : (
          <DeliveryDate
            date={order.deliveries[0]?.date ?? order.deliveryDate}
            isFinalStatus={isFinalStatus}
          />
        )}
        <span className="truncate text-xs text-slate-500">
          {order.responsibleName ?? "Sem responsável"}
        </span>
      </div>
    </div>
  )
}

function shortDate(value: string) {
  const [, month, day] = value.split("-")
  return `${day}/${month}`
}

function itemsLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "itens"}`
}

/**
 * Order whose pending items ship on different ERP dates: the soonest one is
 * what the team has to hit now (and drives the late/at-risk colour); the rest
 * are listed as future deliveries.
 */
function SplitDeliveries({
  deliveries,
  isFinalStatus,
}: {
  deliveries: KanbanOrder["deliveries"]
  isFinalStatus: boolean
}) {
  const [next, ...future] = deliveries
  const late = isOrderLate(next.date, isFinalStatus)
  const atRisk = !late && isOrderAtRisk(next.date, isFinalStatus)
  const shown = future.slice(0, 3)
  const hidden = future.length - shown.length

  return (
    <div className="flex flex-col gap-1.5">
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5",
          late
            ? "border-red-200 bg-red-50"
            : atRisk
              ? "border-amber-200 bg-amber-50"
              : "border-slate-200 bg-slate-50",
        )}
      >
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Próxima entrega
          </span>
          <DeliveryDate date={next.date} isFinalStatus={isFinalStatus} />
        </div>
        <span className="text-xs font-medium text-slate-600">{itemsLabel(next.itemCount)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="inline-flex items-center gap-1 text-slate-500">
          <CalendarClock className="size-3.5" />
          Entregas futuras:
        </span>
        {shown.map((d) => (
          <span
            key={d.date}
            className="rounded border border-slate-200 bg-card px-1.5 py-0.5 text-slate-600"
          >
            {shortDate(d.date)} · {itemsLabel(d.itemCount)}
          </span>
        ))}
        {hidden > 0 ? <span className="text-slate-400">+{hidden}</span> : null}
      </div>
    </div>
  )
}
