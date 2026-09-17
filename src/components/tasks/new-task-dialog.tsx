"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createTask, type ActionResult } from "@/actions/tasks"
import { Plus } from "lucide-react"

const initialState: ActionResult = { error: null }

export function NewTaskDialog({
  users,
  orders,
}: {
  users: { id: string; name: string }[]
  orders: { id: string; erp_order_number: string }[]
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [open, setOpen] = useState(searchParams.get("nova") === "1")
  const [state, formAction, pending] = useActionState(createTask, initialState)
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      setOpen(false)
      formRef.current?.reset()
      if (searchParams.get("nova")) router.replace("/tarefas")
    }
    wasPending.current = pending
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v && searchParams.get("nova")) router.replace("/tarefas")
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Nova tarefa
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form ref={formRef} action={formAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-title">Título *</Label>
            <Input id="new-title" name="title" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-description">Descrição</Label>
            <Textarea id="new-description" name="description" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-responsible">Responsável</Label>
              <select
                id="new-responsible"
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
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-priority">Prioridade</Label>
              <select
                id="new-priority"
                name="priority"
                defaultValue="NORMAL"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-due">Prazo</Label>
              <Input id="new-due" name="due_date" type="date" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-order">Vincular pedido</Label>
              <select
                id="new-order"
                name="order_id"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                <option value="">Tarefa independente</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.erp_order_number}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
