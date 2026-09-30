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
import { Checkbox } from "@/components/ui/checkbox"
import { saveOrderNote } from "@/actions/meetings"
import { formatDay } from "../format"

export type LotNote = {
  committed: boolean
  reason: string | null
  forecastDate: string | null
  /** Meeting where it was recorded (may be an earlier one, carried over). */
  meetingDate: string
  fromThisMeeting: boolean
}

/**
 * Meeting-only annotation of a delivery lot: committed flag, reason and an
 * agreed forecast. The ERP (Zoomsoft) delivery date is never changed.
 */
export function LotNoteDialog({
  meetingId,
  lot,
  note,
  children,
}: {
  meetingId: string
  lot: { orderId: string; orderNumber: string; customerName: string; date: string }
  note: LotNote | undefined
  children: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [committed, setCommitted] = useState(note?.committed ?? false)
  const [reason, setReason] = useState(note?.reason ?? "")
  const [forecast, setForecast] = useState(note?.forecastDate ?? "")

  function save() {
    startTransition(async () => {
      try {
        await saveOrderNote(meetingId, {
          orderId: lot.orderId,
          deliveryDate: lot.date,
          committed,
          reason,
          forecastDate: forecast || null,
        })
        toast.success("Registrado na reunião.")
        setOpen(false)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {lot.customerName} · {lot.orderNumber}
          </DialogTitle>
          <p className="text-sm text-slate-500">
            Entrega no Zoomsoft: {formatDay(lot.date, true)}. O registro fica só nesta reunião.
          </p>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={committed} onCheckedChange={(v) => setCommitted(v === true)} />
            Entrega comprometida
          </label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lot-reason">Motivo</Label>
            <Textarea
              id="lot-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ausência do soldador, aguardando brunimento..."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lot-forecast">Nova previsão combinada</Label>
            <Input
              id="lot-forecast"
              type="date"
              value={forecast}
              onChange={(e) => setForecast(e.target.value)}
              className="w-48"
            />
          </div>
          {note && !note.fromThisMeeting ? (
            <p className="text-xs text-slate-400">
              Último registro na reunião de {formatDay(note.meetingDate)}. Salvar cria o registro desta
              semana.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={pending}>
            {pending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
