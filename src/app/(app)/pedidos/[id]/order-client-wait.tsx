"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Hourglass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { endClientWait, startClientWait } from "@/actions/client-waits"
import { CLIENT_WAIT_ESCALATION_DAYS, formatDateTimeBR } from "@/lib/business-rules"
import { cn } from "@/lib/utils"

export type ClientWait = {
  id: string
  reason: string
  started_at: string
  ended_at: string | null
  task_id: string | null
  statuses: { name: string } | null
  starter: { name: string } | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysLabel(ms: number) {
  const days = Math.floor(ms / DAY_MS)
  if (days < 1) return "menos de 1 dia"
  return `${days} ${days === 1 ? "dia" : "dias"}`
}

/**
 * "Aguardando cliente" on the order page: the open wait (with who marked it,
 * since when and what's missing) or, for gestores in Engenharia/Financeiro,
 * the button to start one. Earlier waits are summarised below.
 */
export function OrderClientWait({
  orderId,
  waits,
  canManage,
  stageAllowsWait,
  now,
}: {
  orderId: string
  waits: ClientWait[]
  canManage: boolean
  stageAllowsWait: boolean
  now: number
}) {
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")

  const current = waits.find((w) => !w.ended_at)
  const past = waits.filter((w) => w.ended_at)
  const pastMs = past.reduce(
    (sum, w) => sum + (new Date(w.ended_at as string).getTime() - new Date(w.started_at).getTime()),
    0,
  )

  if (!current && !(canManage && stageAllowsWait) && past.length === 0) return null

  function run(action: () => Promise<void>, success: string) {
    startTransition(async () => {
      try {
        await action()
        toast.success(success)
        setOpen(false)
        setReason("")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar.")
      }
    })
  }

  const elapsed = current ? now - new Date(current.started_at).getTime() : 0
  const overdue = elapsed >= CLIENT_WAIT_ESCALATION_DAYS * DAY_MS

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border px-4 py-3 text-sm",
        current
          ? overdue
            ? "border-red-200 bg-red-50"
            : "border-sky-200 bg-sky-50"
          : "border-slate-200 bg-card",
      )}
    >
      {current ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-2">
            <Hourglass className={cn("mt-0.5 size-4 shrink-0", overdue ? "text-red-600" : "text-sky-600")} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className={cn("font-semibold", overdue ? "text-red-700" : "text-sky-800")}>
                Aguardando cliente há {daysLabel(elapsed)}
                {current.statuses?.name ? ` · ${current.statuses.name}` : ""}
              </p>
              <p className="text-slate-700">{current.reason}</p>
              <p className="text-xs text-slate-500">
                Marcado por {current.starter?.name ?? "—"} em {formatDateTimeBR(current.started_at)}. Esse
                tempo não conta como tempo parado da etapa.
                {current.task_id ? " Tarefa de cobrança criada." : ""}
              </p>
            </div>
          </div>
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => endClientWait(orderId), "Espera encerrada.")}
            >
              Cliente respondeu
            </Button>
          ) : null}
        </div>
      ) : canManage && stageAllowsWait ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-slate-600">Parado por falta de informação do cliente?</p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Hourglass className="size-4" />
                Aguardando cliente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Aguardando cliente</DialogTitle>
                <DialogDescription>
                  O tempo de espera deixa de contar para a etapa. Se passar de {CLIENT_WAIT_ESCALATION_DAYS} dias,
                  o Flow cria uma tarefa de cobrança e leva o pedido para a reunião.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="client-wait-reason">O que falta do cliente?</Label>
                <Textarea
                  id="client-wait-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: aprovação do desenho, confirmação de medidas, comprovante de pagamento..."
                  rows={3}
                />
              </div>
              <DialogFooter>
                <Button
                  disabled={pending || !reason.trim()}
                  onClick={() => run(() => startClientWait(orderId, reason), "Pedido marcado como aguardando cliente.")}
                >
                  {pending ? "Salvando..." : "Confirmar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : null}

      {past.length > 0 ? (
        <p className="text-xs text-slate-500">
          {past.length === 1 ? "1 espera anterior" : `${past.length} esperas anteriores`} pelo cliente ·{" "}
          {daysLabel(pastMs)} no total
        </p>
      ) : null}
    </div>
  )
}
