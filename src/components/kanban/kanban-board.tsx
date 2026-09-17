"use client"

import { useMemo, useState, useTransition } from "react"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { toast } from "sonner"
import { updateOrderStatus } from "@/actions/orders"
import { OrderCard } from "./order-card"
import type { Role } from "@/types/domain"

export type KanbanOrder = {
  id: string
  erpOrderNumber: string
  customerName: string
  deliveryDate: string | null
  priority: string
  statusId: string | null
  responsibleUserId: string | null
  responsibleName: string | null
  itemCount: number
}

type Status = {
  id: string
  name: string
  color: string
  is_final: boolean
  position: number
}

function canDrag(role: Role, order: KanbanOrder, userId: string) {
  if (role === "ADMIN" || role === "GESTOR") return true
  if (role === "RESPONSAVEL") return order.responsibleUserId === userId
  return false
}

function DraggableCard({
  order,
  isFinalStatus,
  disabled,
}: {
  order: KanbanOrder
  isFinalStatus: boolean
  disabled: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: order.id,
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={disabled ? "" : "cursor-grab active:cursor-grabbing"}
    >
      <OrderCard order={order} isFinalStatus={isFinalStatus} dragging={isDragging} />
    </div>
  )
}

function Column({
  status,
  orders,
  role,
  userId,
}: {
  status: Status
  orders: KanbanOrder[]
  role: Role
  userId: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-lg border bg-slate-100/70 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2.5">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: status.color }} />
        <span className="text-sm font-semibold text-slate-800">{status.name}</span>
        <span className="ml-auto rounded-full bg-white px-1.5 py-0.5 text-xs text-slate-500">
          {orders.length}
        </span>
      </div>
      <div className="flex min-h-24 flex-col gap-2 p-2">
        {orders.map((order) => (
          <DraggableCard
            key={order.id}
            order={order}
            isFinalStatus={status.is_final}
            disabled={!canDrag(role, order, userId)}
          />
        ))}
      </div>
    </div>
  )
}

export function KanbanBoard({
  statuses,
  orders,
  currentUserId,
  role,
}: {
  statuses: Status[]
  orders: KanbanOrder[]
  currentUserId: string
  role: Role
}) {
  const [localOrders, setLocalOrders] = useState(orders)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const byStatus = useMemo(() => {
    const map = new Map<string, KanbanOrder[]>()
    for (const status of statuses) map.set(status.id, [])
    for (const order of localOrders) {
      if (order.statusId && map.has(order.statusId)) {
        map.get(order.statusId)!.push(order)
      }
    }
    return map
  }, [statuses, localOrders])

  const activeOrder = activeId ? localOrders.find((o) => o.id === activeId) ?? null : null
  const activeStatus = activeOrder
    ? statuses.find((s) => s.id === activeOrder.statusId) ?? null
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const orderId = String(active.id)
    const newStatusId = String(over.id)
    const order = localOrders.find((o) => o.id === orderId)
    if (!order || order.statusId === newStatusId) return

    const previousStatusId = order.statusId
    setLocalOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, statusId: newStatusId } : o)),
    )

    const targetStatus = statuses.find((s) => s.id === newStatusId)

    startTransition(async () => {
      try {
        await updateOrderStatus(orderId, newStatusId)
        toast.success(`Pedido ${order.erpOrderNumber} movido para ${targetStatus?.name}.`)
      } catch {
        setLocalOrders((prev) =>
          prev.map((o) => (o.id === orderId ? { ...o, statusId: previousStatusId } : o)),
        )
        toast.error("Não foi possível mover o pedido.")
      }
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        {statuses.map((status) => (
          <Column
            key={status.id}
            status={status}
            orders={byStatus.get(status.id) ?? []}
            role={role}
            userId={currentUserId}
          />
        ))}
      </div>
      <DragOverlay>
        {activeOrder ? (
          <OrderCard order={activeOrder} isFinalStatus={activeStatus?.is_final ?? false} dragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
