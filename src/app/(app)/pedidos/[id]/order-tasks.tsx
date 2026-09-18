"use client"

import { useActionState, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { createTask, updateTaskStatus, type ActionResult } from "@/actions/tasks"
import { PriorityBadge } from "@/components/domain/priority-badge"
import { TaskEditDialog } from "@/components/tasks/task-edit-dialog"
import type { TaskRowData } from "@/components/tasks/task-row"
import { Plus } from "lucide-react"

type Task = {
  id: string
  title: string
  description: string | null
  status: string
  priority: string
  due_date: string | null
  created_at: string
  completed_at: string | null
  responsible_user_id: string | null
  created_by: string
  users: { name: string } | null
}

const initialState: ActionResult = { error: null }

function TaskListItem({
  task,
  orderId,
  users,
}: {
  task: Task
  orderId: string
  users: { id: string; name: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()

  function toggleDone() {
    startTransition(async () => {
      try {
        await updateTaskStatus(task.id, task.status === "DONE" ? "TODO" : "DONE")
      } catch {
        toast.error("Não foi possível atualizar a tarefa.")
      }
    })
  }

  const taskRowData: TaskRowData = { ...task, order_id: orderId, orders: null }

  return (
    <li className="flex items-center gap-3 py-2">
      <Checkbox checked={task.status === "DONE"} onCheckedChange={toggleDone} />
      <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 text-left">
        <p
          className={`truncate text-sm ${task.status === "DONE" ? "text-slate-400 line-through" : "text-slate-800"}`}
        >
          {task.title}
        </p>
        <p className="text-xs text-slate-400">
          {task.users?.name ?? "Sem responsável"}
          {task.due_date ? ` · ${task.due_date.split("-").reverse().join("/")}` : ""}
        </p>
      </button>
      <PriorityBadge priority={task.priority} />
      <TaskEditDialog task={taskRowData} users={users} open={open} onOpenChange={setOpen} canEdit />
    </li>
  )
}

export function OrderTasks({
  orderId,
  tasks,
  users,
}: {
  orderId: string
  tasks: Task[]
  users: { id: string; name: string }[]
}) {
  const [showForm, setShowForm] = useState(false)
  const [state, formAction, pending] = useActionState(createTask, initialState)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Tarefas relacionadas</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-4" />
          Nova tarefa
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {showForm ? (
          <form
            action={(fd) => {
              fd.set("order_id", orderId)
              formAction(fd)
            }}
            className="flex flex-col gap-2 rounded-md border border-slate-200 p-3"
          >
            <Input name="title" placeholder="Título da tarefa" required />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <select
                name="responsible_user_id"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                name="priority"
                defaultValue="NORMAL"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
              <Input name="due_date" type="date" />
            </div>
            {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Salvando..." : "Adicionar"}
              </Button>
            </div>
          </form>
        ) : null}

        {tasks.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Nenhuma tarefa vinculada a este pedido.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {tasks.map((task) => (
              <TaskListItem key={task.id} task={task} orderId={orderId} users={users} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
