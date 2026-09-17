"use client"

import { useActionState, useState } from "react"
import { createOrder, type ActionResult } from "@/actions/orders"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"

const initialState: ActionResult = { error: null }

type ItemRow = { key: number; code: string; description: string; quantity: string; unit: string }

let nextKey = 1

function emptyItem(): ItemRow {
  return { key: nextKey++, code: "", description: "", quantity: "1", unit: "UN" }
}

export function NewOrderForm({
  statuses,
}: {
  statuses: { id: string; name: string }[]
}) {
  const [state, formAction, pending] = useActionState(createOrder, initialState)
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  function updateItem(key: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, [field]: value } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()])
  }

  function removeItem(key: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev))
  }

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

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Itens do pedido</Label>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus className="size-4" />
            Adicionar item
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <div
              key={item.key}
              className="grid grid-cols-1 items-center gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[100px_1fr_90px_80px_auto]"
            >
              <Input
                placeholder="Código"
                value={item.code}
                onChange={(e) => updateItem(item.key, "code", e.target.value)}
                name="item_code"
              />
              <Input
                placeholder="Descrição"
                value={item.description}
                onChange={(e) => updateItem(item.key, "description", e.target.value)}
                name="item_description"
              />
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="Qtd."
                value={item.quantity}
                onChange={(e) => updateItem(item.key, "quantity", e.target.value)}
                name="item_quantity"
              />
              <Input
                placeholder="Un."
                value={item.unit}
                onChange={(e) => updateItem(item.key, "unit", e.target.value)}
                name="item_unit"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeItem(item.key)}
                disabled={items.length === 1}
                aria-label="Remover item"
              >
                <Trash2 className="size-4 text-slate-400" />
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Linhas com descrição em branco são ignoradas ao salvar.
        </p>
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
