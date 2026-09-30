"use client"

import Link from "next/link"
import { Plus, Radar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { AttentionPoint } from "@/lib/meetings"
import { AREA_OPTIONS, NewPendenciaDialog } from "./new-pendencia-dialog"

export const AREA_TONE: Record<string, string> = {
  PRODUCAO: "border-slate-200 bg-slate-50 text-slate-700",
  COMPRAS: "border-amber-200 bg-amber-50 text-amber-700",
  ENGENHARIA: "border-blue-200 bg-blue-50 text-blue-700",
  COLETAS: "border-violet-200 bg-violet-50 text-violet-700",
  GERAL: "border-slate-200 bg-slate-50 text-slate-600",
}
export const AREA_LABEL: Record<string, string> = Object.fromEntries(AREA_OPTIONS.map((a) => [a.key, a.label]))

export function AreaBadge({ area }: { area: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${AREA_TONE[area] ?? ""}`}>
      {AREA_LABEL[area] ?? area}
    </span>
  )
}

export function AttentionPoints({
  meetingId,
  points,
  canConduct,
  users,
  orders,
}: {
  meetingId: string
  points: AttentionPoint[]
  canConduct: boolean
  users: { id: string; name: string }[]
  orders: { id: string; label: string }[]
}) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Radar className="size-4 text-primary" />
          Pontos de atenção
        </CardTitle>
        <p className="text-xs text-slate-500">Levantados pelo Flow a partir dos pedidos em andamento.</p>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-sm text-slate-500">Nada em terceiros, aguardando matéria-prima ou com projeto pendente.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {points.map((p) => (
              <li key={p.key} className="flex items-center gap-3 py-2 text-sm">
                <AreaBadge area={p.area} />
                <span className="min-w-0 flex-1 text-slate-700">
                  {p.orderId ? (
                    <Link href={`/pedidos/${p.orderId}`} className="hover:underline">
                      {p.title}
                    </Link>
                  ) : (
                    p.title
                  )}
                </span>
                {canConduct ? (
                  <NewPendenciaDialog
                    meetingId={meetingId}
                    users={users}
                    orders={orders}
                    prefill={{ area: p.area, title: p.title, orderId: p.orderId }}
                  >
                    <Button variant="outline" size="sm" className="h-7 print:hidden">
                      <Plus className="size-3.5" />
                      Pendência
                    </Button>
                  </NewPendenciaDialog>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
