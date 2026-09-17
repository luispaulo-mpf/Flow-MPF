"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { PriorityBadge } from "@/components/domain/priority-badge"
import { updateTaskStatus } from "@/actions/tasks"
import { isTaskLate } from "@/lib/business-rules"
import { TaskEditDialog } from "./task-edit-dialog"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

export type TaskRowData = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  responsible_user_id: string | null
  order_id: string | null
  created_by: string
  orders: { erp_order_number: string } | null
  users: { name: string } | null
}

export function TaskRow({
  task,
  users,
  canEdit,
}: {
  task: TaskRowData
  users: { id: string; name: string }[]
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  const late = isTaskLate(task.due_date, task.status)

  function toggleDone() {
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, task.status === "DONE" ? "TODO" : "DONE")
      } catch {
        toast.error("Não foi possível atualizar a tarefa.")
      }
    })
  }

  return (
    <>
      <li className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50">
        <Checkbox checked={task.status === "DONE"} onCheckedChange={canEdit ? toggleDone : undefined} disabled={!canEdit} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`truncate text-sm ${task.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800"}`}
          >
            {task.title}
          </p>
          <p className="flex items-center gap-1 text-xs text-slate-400">
            {late ? <AlertTriangle className="size-3 text-red-500" /> : null}
            {task.users?.name ?? "Sem responsável"}
            {task.due_date ? ` · ${task.due_date.split("-").reverse().join("/")}` : ""}
            {task.orders ? ` · Pedido ${task.orders.erp_order_number}` : ""}
          </p>
        </button>
        {task.order_id ? (
          <Link
            href={`/pedidos/${task.order_id}`}
            className="hidden text-xs text-primary hover:underline sm:inline"
          >
            Ver pedido
          </Link>
        ) : null}
        <PriorityBadge priority={task.priority} />
      </li>
      <TaskEditDialog task={task} users={users} open={open} onOpenChange={setOpen} canEdit={canEdit} />
    </>
  )
}
