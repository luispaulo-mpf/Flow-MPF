"use client"

import Link from "next/link"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ListChecks, Plus } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { updateTaskDueDate, updateTaskResponsible, updateTaskStatus } from "@/actions/tasks"
import { isTaskLate } from "@/lib/business-rules"
import { cn } from "@/lib/utils"
import { AREA_OPTIONS, NewPendenciaDialog } from "./new-pendencia-dialog"
import { AreaBadge } from "./attention-points"
import { formatDay, TASK_STATUS_LABELS } from "../format"

export type Pendencia = {
  id: string
  title: string
  status: string
  due_date: string | null
  completed_at: string | null
  meeting_area: string
  meeting_id: string | null
  order_id: string | null
  responsible_user_id: string | null
  created_by: string
  users: { name: string } | null
  orders: { erp_order_number: string; customer_name: string } | null
  statusAtMeeting?: string | null
  discussedOn?: string[]
}

const STATUS_TONE: Record<string, string> = {
  TODO: "text-slate-600",
  IN_PROGRESS: "text-blue-600",
  BLOCKED: "text-orange-600",
  DONE: "text-green-600",
}

const cellSelect = "h-8 w-full rounded-md border border-input bg-transparent px-1.5 text-xs"

export function Pendencias({
  meetingId,
  pendencias,
  isOpen,
  canConduct,
  users,
  orders,
}: {
  meetingId: string
  pendencias: Pendencia[]
  isOpen: boolean
  canConduct: boolean
  users: { id: string; name: string }[]
  orders: { id: string; label: string }[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível atualizar.")
      }
    })
  }

  const areaOrder = AREA_OPTIONS.map((a) => a.key as string)
  const sorted = [...pendencias].sort(
    (a, b) =>
      areaOrder.indexOf(a.meeting_area) - areaOrder.indexOf(b.meeting_area) ||
      Number(a.status === "DONE") - Number(b.status === "DONE") ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"),
  )
  const openCount = pendencias.filter((p) => p.status !== "DONE").length

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4 text-primary" />
            Pendências
          </CardTitle>
          <p className="text-xs text-slate-500">
            {isOpen
              ? `${openCount} em aberto. Pendência não concluída volta sozinha na próxima reunião; também aparece em Minhas tarefas do responsável.`
              : "Status naquele dia e status hoje."}
          </p>
        </div>
        {canConduct ? (
          <NewPendenciaDialog meetingId={meetingId} users={users} orders={orders}>
            <Button size="sm" variant="outline" className="print:hidden">
              <Plus className="size-4" />
              Nova pendência
            </Button>
          </NewPendenciaDialog>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {sorted.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma pendência.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="w-32 py-1 pr-3 font-medium">Área</th>
                <th className="py-1 pr-3 font-medium">Pendência</th>
                <th className="w-36 py-1 pr-3 font-medium">Quem</th>
                <th className="w-32 py-1 pr-3 font-medium">Prazo</th>
                <th className="w-36 py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const late = isTaskLate(p.due_date, p.status)
                return (
                  <tr key={p.id} className={cn("border-t border-slate-100 align-top", p.status === "DONE" && "opacity-70")}>
                    <td className="py-2 pr-3">
                      <AreaBadge area={p.meeting_area} />
                    </td>
                    <td className="py-2 pr-3">
                      <p className={cn("text-slate-800", p.status === "DONE" && "line-through")}>{p.title}</p>
                      <p className="text-xs text-slate-500">
                        {p.orders && p.order_id ? (
                          <Link href={`/pedidos/${p.order_id}`} className="hover:underline">
                            Pedido {p.orders.erp_order_number} · {p.orders.customer_name}
                          </Link>
                        ) : (
                          "Sem pedido"
                        )}
                        {p.discussedOn && p.discussedOn.length > 0
                          ? ` · discutida em ${p.discussedOn.map((d) => formatDay(d)).join(", ")}`
                          : ""}
                      </p>
                    </td>
                    <td className="py-2 pr-3">
                      {canConduct ? (
                        <select
                          className={cn(cellSelect, "print:hidden")}
                          value={p.responsible_user_id ?? ""}
                          onChange={(e) => run(() => updateTaskResponsible(p.id, e.target.value || null))}
                        >
                          <option value="">Sem responsável</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <span className={cn("text-slate-700", canConduct && "hidden print:inline")}>
                        {p.users?.name ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      {canConduct ? (
                        <input
                          type="date"
                          className={cn(cellSelect, "print:hidden", late && "border-red-200 text-red-600")}
                          value={p.due_date ?? ""}
                          onChange={(e) => run(() => updateTaskDueDate(p.id, e.target.value || null))}
                        />
                      ) : null}
                      <span className={cn(late ? "font-medium text-red-600" : "text-slate-700", canConduct && "hidden print:inline")}>
                        {formatDay(p.due_date)}
                      </span>
                    </td>
                    <td className="py-2">
                      {canConduct ? (
                        <select
                          className={cn(cellSelect, STATUS_TONE[p.status], "print:hidden")}
                          value={p.status}
                          onChange={(e) => run(() => updateTaskStatus(p.id, e.target.value))}
                        >
                          {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      <div className={cn(canConduct && "hidden print:block")}>
                        {!isOpen && p.statusAtMeeting ? (
                          <p className="text-xs text-slate-500">
                            Naquele dia: {TASK_STATUS_LABELS[p.statusAtMeeting] ?? p.statusAtMeeting}
                          </p>
                        ) : null}
                        <p className={cn("text-xs font-medium", STATUS_TONE[p.status])}>
                          {!isOpen ? "Hoje: " : ""}
                          {TASK_STATUS_LABELS[p.status] ?? p.status}
                          {p.status === "DONE" && p.completed_at ? ` em ${formatDay(p.completed_at)}` : ""}
                        </p>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}
