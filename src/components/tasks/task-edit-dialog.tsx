"use client"

import { useActionState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { updateTask, type ActionResult } from "@/actions/tasks"
import type { TaskRowData } from "./task-row"

const initialState: ActionResult = { error: null }

function formatDateTime(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString("pt-BR")
}

export function TaskEditDialog({
  task,
  users,
  open,
  onOpenChange,
  canEdit,
}: {
  task: TaskRowData
  users: { id: string; name: string }[]
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit: boolean
}) {
  const [state, formAction, pending] = useActionState(updateTask, initialState)

  useEffect(() => {
    if (!pending && !state.error && state !== initialState) onOpenChange(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{canEdit ? "Editar tarefa" : "Tarefa"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="task_id" value={task.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" defaultValue={task.title} disabled={!canEdit} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              name="description"
              defaultValue={task.description ?? ""}
              disabled={!canEdit}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                name="status"
                defaultValue={task.status}
                disabled={!canEdit}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="TODO">A fazer</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="BLOCKED">Bloqueada</option>
                <option value="DONE">Concluída</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="priority">Prioridade</Label>
              <select
                id="priority"
                name="priority"
                defaultValue={task.priority}
                disabled={!canEdit}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsible_user_id">Responsável</Label>
              <select
                id="responsible_user_id"
                name="responsible_user_id"
                defaultValue={task.responsible_user_id ?? ""}
                disabled={!canEdit}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="due_date">Prazo</Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={task.due_date ?? ""}
                disabled={!canEdit}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Criado em: {formatDateTime(task.created_at)}</span>
            {task.completed_at ? <span>Concluído em: {formatDateTime(task.completed_at)}</span> : null}
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          {canEdit ? (
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  )
}
