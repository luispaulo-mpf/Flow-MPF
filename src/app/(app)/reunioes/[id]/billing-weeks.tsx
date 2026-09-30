"use client"

import { Check, Truck } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Lot, LotOutcome, MeetingAgenda } from "@/lib/meetings"
import { cn } from "@/lib/utils"
import { LotNoteDialog, type LotNote } from "./lot-note-dialog"
import { formatDay, plural, weekdayLabel } from "../format"

function lotTone(lot: Lot, note: LotNote | undefined) {
  if (lot.risk === "done") return { dot: "bg-slate-400", border: "border-slate-200", label: "Já saiu" }
  if (note?.committed) return { dot: "bg-red-500", border: "border-red-200", label: "Comprometido" }
  if (lot.risk === "warn")
    return { dot: "bg-amber-500", border: "border-amber-200", label: "Itens aguardando MP ou em terceiros" }
  return { dot: "bg-green-500", border: "border-slate-200", label: "No ritmo" }
}

const OUTCOME_MARK: Record<LotOutcome, { text: string; cls: string }> = {
  on_time: { text: "✓", cls: "text-green-600" },
  late_done: { text: "atrasou", cls: "text-amber-600" },
  pending: { text: "não saiu", cls: "text-red-600" },
}

function LotChip({
  lot,
  note,
  outcome,
}: {
  lot: Lot
  note: LotNote | undefined
  outcome: LotOutcome | undefined
}) {
  const tone = lotTone(lot, note)
  const detail =
    lot.pendingCount > 0
      ? `${lot.pendingCount} de ${plural(lot.itemCount, "item pendente", "itens pendentes")}: ${lot.pendingByStage
          .map((s) => `${s.name} (${s.count})`)
          .join(", ")}`
      : "Todos os itens prontos ou pedido faturado"
  return (
    <span
      title={`${tone.label}. ${detail}${note?.reason ? `. Motivo: ${note.reason}` : ""}`}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md border bg-card px-2 py-1 text-left text-xs text-slate-700",
        tone.border,
      )}
    >
      <span className="flex items-center gap-1.5">
        {lot.risk === "done" ? (
          <Check className="size-3 shrink-0 text-slate-400" />
        ) : (
          <span className={cn("size-2 shrink-0 rounded-full", tone.dot)} />
        )}
        <span className="flex-1 font-semibold text-slate-900">{lot.orderNumber}</span>
        {outcome ? (
          <span className={cn("shrink-0 font-medium", OUTCOME_MARK[outcome].cls)}>{OUTCOME_MARK[outcome].text}</span>
        ) : null}
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight text-slate-500">{lot.customerName}</span>
    </span>
  )
}

export function BillingWeeks({
  meetingId,
  weeks,
  notes,
  canConduct,
  outcomes: rawOutcomes,
  today,
}: {
  meetingId: string
  weeks: MeetingAgenda["weeks"]
  notes: Record<string, LotNote>
  canConduct: boolean
  outcomes: Record<string, LotOutcome> | null
  /** YYYY-MM-DD; a lot that isn't out yet only counts as missed after its date. */
  today: string
}) {
  // Not out but not due yet: no verdict.
  const outcomes = rawOutcomes
    ? Object.fromEntries(
        Object.entries(rawOutcomes).filter(
          ([key, outcome]) => outcome !== "pending" || key.split("|")[1] < today,
        ),
      )
    : null
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="size-4 text-primary" />
          Faturamento previsto
        </CardTitle>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Data de entrega do Zoomsoft, por dia.</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-green-500" /> no ritmo</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /> aguardando MP ou em terceiros</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" /> comprometido</span>
          <span className="inline-flex items-center gap-1"><Check className="size-3 text-slate-400" /> já saiu</span>
          {canConduct ? <span className="print:hidden">Clique num pedido para marcar comprometido.</span> : null}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {weeks.map((week, weekIndex) => {
          const weekLots = week.days.flatMap((d) => d.lots)
          const counts = outcomes
            ? {
                on_time: weekLots.filter((l) => outcomes[l.key] === "on_time").length,
                late_done: weekLots.filter((l) => outcomes[l.key] === "late_done").length,
                pending: weekLots.filter((l) => outcomes[l.key] === "pending").length,
                upcoming: weekLots.filter((l) => !outcomes[l.key]).length,
              }
            : null
          return (
            <div key={week.start} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  {weekIndex === 0 ? "Semana da reunião" : "Semana seguinte"} · {formatDay(week.start)} a{" "}
                  {formatDay(week.days[4].date)}
                  <span className="ml-2 font-normal text-slate-500">
                    {plural(weekLots.length, "entrega", "entregas")}
                  </span>
                </h3>
                {counts && weekIndex === 0 && weekLots.length > 0 ? (
                  <p className="text-xs text-slate-600">
                    Resultado: <span className="font-medium text-green-600">{counts.on_time} no prazo</span> ·{" "}
                    <span className="font-medium text-amber-600">{counts.late_done} com atraso</span> ·{" "}
                    <span className="font-medium text-red-600">{counts.pending} não saíram no prazo</span>
                    {counts.upcoming > 0 ? <> · {counts.upcoming} ainda a vencer</> : null}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                {week.days.map((day, i) => (
                  <div key={day.date} className="flex flex-col gap-1.5 rounded-md bg-slate-50 p-2">
                    <p className="text-xs font-medium text-slate-500">
                      {weekdayLabel(i)} <span className="font-normal">{formatDay(day.date)}</span>
                    </p>
                    {day.lots.length === 0 ? <span className="text-xs text-slate-300">—</span> : null}
                    {day.lots.map((lot) => {
                      const chip = (
                        <LotChip
                          lot={lot}
                          note={notes[lot.key]}
                          outcome={outcomes ? outcomes[lot.key] : undefined}
                        />
                      )
                      return canConduct && lot.risk !== "done" ? (
                        <LotNoteDialog key={lot.key} meetingId={meetingId} lot={lot} note={notes[lot.key]}>
                          <button type="button" className="w-full cursor-pointer">
                            {chip}
                          </button>
                        </LotNoteDialog>
                      ) : (
                        <div key={lot.key}>{chip}</div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
