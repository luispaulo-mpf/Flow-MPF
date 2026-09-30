"use client"

import Link from "next/link"
import { AlertTriangle, Pencil } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { LateLot, LotOutcome } from "@/lib/meetings"
import { LotNoteDialog, type LotNote } from "./lot-note-dialog"
import { formatDay, plural } from "../format"

export function OutcomeBadge({ outcome }: { outcome: LotOutcome | undefined }) {
  if (!outcome) return null
  const map = {
    on_time: { label: "Saiu no prazo", cls: "border-green-200 bg-green-50 text-green-700" },
    late_done: { label: "Saiu com atraso", cls: "border-amber-200 bg-amber-50 text-amber-700" },
    pending: { label: "Ainda não saiu", cls: "border-red-200 bg-red-50 text-red-700" },
  }[outcome]
  return (
    <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${map.cls}`}>
      {map.label}
    </span>
  )
}

export function LateLots({
  meetingId,
  lots,
  notes,
  canConduct,
  outcomes,
}: {
  meetingId: string
  lots: LateLot[]
  notes: Record<string, LotNote>
  canConduct: boolean
  outcomes: Record<string, LotOutcome> | null
}) {
  if (lots.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 pt-4 text-sm text-slate-500">
          <AlertTriangle className="size-4 text-slate-400" />
          Nenhum pedido atrasado{outcomes ? " naquela semana" : ""}.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-red-600">
          <AlertTriangle className="size-4" />
          Atrasados: entrega já passou e ainda não saiu ({lots.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1 pr-3 font-medium">Pedido</th>
              <th className="py-1 pr-3 font-medium">Atraso</th>
              <th className="py-1 pr-3 font-medium">O que falta</th>
              <th className="py-1 pr-3 font-medium">Motivo e nova previsão</th>
              <th className="py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => {
              const note = notes[lot.key]
              return (
                <tr key={lot.key} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-3">
                    <Link href={`/pedidos/${lot.orderId}`} className="font-medium text-slate-900 hover:underline">
                      {lot.customerName} · {lot.orderNumber}
                    </Link>
                    <p className="text-xs text-slate-500">entrega {formatDay(lot.date, true)}</p>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="whitespace-nowrap rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      {plural(lot.daysLate, "dia", "dias")}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {lot.pendingCount} de {plural(lot.itemCount, "item", "itens")}
                    <p className="text-xs text-slate-500">
                      {lot.pendingByStage.map((s) => `${s.name} (${s.count})`).join(" · ")}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-slate-700">
                    {note?.reason || note?.forecastDate ? (
                      <>
                        {note.reason ? <p>{note.reason}</p> : null}
                        {note.forecastDate ? (
                          <p className="text-xs font-medium text-slate-600">
                            Nova previsão: {formatDay(note.forecastDate, true)}
                          </p>
                        ) : null}
                        {!note.fromThisMeeting ? (
                          <p className="text-xs text-slate-400">registrado em {formatDay(note.meetingDate)}</p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Sem motivo registrado</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {outcomes ? (
                      <OutcomeBadge outcome={outcomes[lot.key]} />
                    ) : canConduct ? (
                      <LotNoteDialog meetingId={meetingId} lot={lot} note={note}>
                        <Button variant="outline" size="sm" className="print:hidden">
                          <Pencil className="size-3.5" />
                          {note?.fromThisMeeting ? "Editar" : "Registrar"}
                        </Button>
                      </LotNoteDialog>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
