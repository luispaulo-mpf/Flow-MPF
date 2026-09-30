"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createMeetingTask } from "@/actions/meetings"

// Mirrors MEETING_AREAS in lib/meetings (server-only module).
export const AREA_OPTIONS = [
  { key: "PRODUCAO", label: "Produção" },
  { key: "COMPRAS", label: "Compras/Almoxarifado" },
  { key: "ENGENHARIA", label: "Engenharia" },
  { key: "COLETAS", label: "Coletas" },
  { key: "GERAL", label: "Assuntos gerais" },
] as const

const selectClass = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"

export function NewPendenciaDialog({
  meetingId,
  users,
  orders,
  prefill,
  children,
}: {
  meetingId: string
  users: { id: string; name: string }[]
  orders: { id: string; label: string }[]
  prefill?: { area?: string; title?: string; orderId?: string | null }
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [area, setArea] = useState(prefill?.area ?? "PRODUCAO")
  const [title, setTitle] = useState(prefill?.title ?? "")
  const [responsible, setResponsible] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [orderId, setOrderId] = useState(prefill?.orderId ?? "")
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (!title.trim()) {
      setError("Descreva a pendência.")
      return
    }
    startTransition(async () => {
      try {
        await createMeetingTask(meetingId, {
          area,
          title,
          responsibleUserId: responsible || null,
          dueDate: dueDate || null,
          orderId: orderId || null,
        })
        toast.success("Pendência criada. Ela aparece em Minhas tarefas do responsável.")
        setOpen(false)
        setTitle(prefill?.title ?? "")
        setResponsible("")
        setDueDate("")
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível criar a pendência.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova pendência</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-area">Área</Label>
              <select id="p-area" className={selectClass} value={area} onChange={(e) => setArea(e.target.value)}>
                {AREA_OPTIONS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-order">Pedido (opcional)</Label>
              <select id="p-order" className={selectClass} value={orderId ?? ""} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">Sem pedido</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-title">Pendência</Label>
            <Textarea
              id="p-title"
              rows={2}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                setError(null)
              }}
              placeholder="Ex.: Confirmar retorno do brunimento com o fornecedor"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-resp">Responsável</Label>
              <select id="p-resp" className={selectClass} value={responsible} onChange={(e) => setResponsible(e.target.value)}>
                <option value="">Sem responsável</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-due">Prazo</Label>
              <Input id="p-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Criando..." : "Criar pendência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
