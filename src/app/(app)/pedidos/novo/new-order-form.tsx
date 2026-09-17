"use client"

import { useActionState } from "react"
import { createOrder, type ActionResult } from "@/actions/orders"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

const initialState: ActionResult = { error: null }

export function NewOrderForm({
  statuses,
}: {
  statuses: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(createOrder, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="erp_order_number">Número do pedido *</Label>
          <Input id="erp_order_number" name="erp_order_number" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer_name">Cliente *</Label>
          <Input id="customer_name" name="customer_name" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="issue_date">Data de emissão</Label>
          <Input id="issue_date" name="issue_date" type="date" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="delivery_date">Data de entrega</Label>
          <Input id="delivery_date" name="delivery_date" type="date" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="total_value">Valor total</Label>
          <Input id="total_value" name="total_value" type="number" step="0.01" min="0" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="priority">Prioridade</Label>
          <select
            id="priority"
            name="priority"
            defaultValue="NORMAL"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="LOW">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">Alta</option>
            <option value="URGENT">Urgente</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="status_id">Status inicial</Label>
          <select
            id="status_id"
            name="status_id"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Sem status</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" name="notes" rows={3} />
        </div>
      </div>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Criar pedido"}
        </Button>
      </div>
    </form>
  )
}
