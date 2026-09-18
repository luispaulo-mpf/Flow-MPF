"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  addOrderItem,
  deleteOrderItem,
  updateOrderItemStatus,
  updateItemEngineeringReview,
  type ActionResult,
} from "@/actions/orders"
import { Plus, Trash2 } from "lucide-react"

type ItemStatus = { id: string; name: string; color: string }

type Item = {
  id: string
  erp_item_code: string | null
  description: string
  quantity: number
  unit: string | null
  status_id: string | null
  engineering_review: string | null
  delivery_date: string | null
  statuses: { name: string; color: string } | null
}

const initialState: ActionResult = { error: null }

function formatDate(value: string | null) {
  if (!value) return "—"
  const [y, m, d] = value.split("-")
  return `${d}/${m}/${y}`
}

const ENGINEERING_REVIEW_LABELS: Record<string, string> = {
  REVISADO: "Revisado",
  NECESSITA_PROJETO: "Necessita projeto",
  NECESSITA_REVISAO: "Necessita revisão",
}

function EngineeringReviewSelect({
  orderId,
  item,
  canEdit,
}: {
  orderId: string
  item: Item
  canEdit: boolean
}) {
  const [, startTransition] = useTransition()

  if (!canEdit) {
    return (
      <span className="text-sm text-slate-600">
        {item.engineering_review ? ENGINEERING_REVIEW_LABELS[item.engineering_review] : "—"}
      </span>
    )
  }

  return (
    <select
      defaultValue={item.engineering_review ?? ""}
      onChange={(e) => {
        const value = e.target.value
        if (!value) return
        startTransition(async () => {
          try {
            await updateItemEngineeringReview(orderId, item.id, value)
          } catch {
            toast.error("Não foi possível salvar a revisão de engenharia.")
          }
        })
      }}
      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
    >
      <option value="" disabled>
        Selecione
      </option>
      <option value="REVISADO">Revisado</option>
      <option value="NECESSITA_PROJETO">Necessita projeto</option>
      <option value="NECESSITA_REVISAO">Necessita revisão</option>
    </select>
  )
}

function ItemStatusSelect({
  orderId,
  item,
  itemStatuses,
  canEdit,
}: {
  orderId: string
  item: Item
  itemStatuses: ItemStatus[]
  canEdit: boolean
}) {
  const [, startTransition] = useTransition()

  if (!canEdit) {
    return item.statuses ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
        <span className="size-2 rounded-full" style={{ backgroundColor: item.statuses.color }} />
        {item.statuses.name}
      </span>
    ) : (
      <span className="text-sm text-slate-400">—</span>
    )
  }

  return (
    <select
      defaultValue={item.status_id ?? ""}
      onChange={(e) => {
        const statusId = e.target.value
        startTransition(async () => {
          try {
            await updateOrderItemStatus(orderId, item.id, statusId)
          } catch {
            toast.error("Não foi possível atualizar o status do item.")
          }
        })
      }}
      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
    >
      <option value="" disabled>
        Selecione
      </option>
      {itemStatuses.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  )
}

export function OrderItems({
  orderId,
  items,
  itemStatuses,
  canEdit,
  showEngineeringReview,
}: {
  orderId: string
  items: Item[]
  itemStatuses: ItemStatus[]
  canEdit: boolean
  showEngineeringReview: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [state, formAction, pending] = useActionState(addOrderItem, initialState)
  const [, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      formRef.current?.reset()
      setShowForm(false)
    }
    wasPending.current = pending
  }, [pending, state])

  function removeItem(itemId: string) {
    startTransition(async () => {
      try {
        await deleteOrderItem(orderId, itemId)
        toast.success("Item removido.")
      } catch {
        toast.error("Não foi possível remover o item.")
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Itens do pedido</CardTitle>
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-4" />
            Adicionar item
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-0">
        {showForm ? (
          <form
            ref={formRef}
            action={(fd) => {
              fd.set("order_id", orderId)
              formAction(fd)
            }}
            className="mx-4 flex flex-col gap-2 rounded-md border border-slate-200 p-3 sm:grid sm:grid-cols-[100px_1fr_90px_80px_140px_auto] sm:items-center sm:gap-2 sm:space-y-0"
          >
            <Input name="code" placeholder="Código" />
            <Input name="description" placeholder="Descrição" required />
            <Input name="quantity" type="number" step="0.01" min="0" placeholder="Qtd." defaultValue="1" />
            <Input name="unit" placeholder="Un." defaultValue="UN" />
            <Input name="delivery_date" type="date" title="Prazo do item (opcional)" />
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Salvando..." : "Salvar"}
            </Button>
            {state.error ? (
              <p className="text-sm text-destructive sm:col-span-6">{state.error}</p>
            ) : null}
          </form>
        ) : null}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Qtd.</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
                {showEngineeringReview ? <TableHead>Engenharia</TableHead> : null}
                {canEdit ? <TableHead className="w-10" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-slate-500">{item.erp_item_code ?? "—"}</TableCell>
                  <TableCell>{item.description}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.unit ?? "—"}</TableCell>
                  <TableCell className="text-slate-500">{formatDate(item.delivery_date)}</TableCell>
                  <TableCell>
                    <ItemStatusSelect
                      orderId={orderId}
                      item={item}
                      itemStatuses={itemStatuses}
                      canEdit={canEdit}
                    />
                  </TableCell>
                  {showEngineeringReview ? (
                    <TableCell>
                      <EngineeringReviewSelect orderId={orderId} item={item} canEdit={canEdit} />
                    </TableCell>
                  ) : null}
                  {canEdit ? (
                    <TableCell>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover item"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="size-4 text-slate-400" />
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
              {items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6 + (showEngineeringReview ? 1 : 0) + (canEdit ? 1 : 0)}
                    className="py-6 text-center text-sm text-slate-500"
                  >
                    Nenhum item cadastrado.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
