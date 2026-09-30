import Link from "next/link"
import { CalendarDays, ChevronRight, Search } from "lucide-react"
import { requireUser, canManageOperations } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { lotOutcomes, type MeetingAgenda } from "@/lib/meetings"
import { todayISO } from "@/lib/business-rules"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { NewMeetingButton } from "./new-meeting-button"
import { formatDay, plural } from "./format"

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

export default async function ReunioesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const { q } = await searchParams
  const supabase = await createClient()

  const { data: meetings } = await supabase
    .from("meetings")
    .select("id, meeting_date, status, notes, snapshot, is_test")
    .eq("company_id", user.companyId)
    .order("meeting_date", { ascending: false })

  const ids = (meetings ?? []).map((m) => m.id)
  const [{ data: participants }, { data: tasks }] = ids.length
    ? await Promise.all([
        supabase.from("meeting_participants").select("meeting_id, name").in("meeting_id", ids),
        supabase.from("tasks").select("meeting_id, title, status").in("meeting_id", ids),
      ])
    : [{ data: [] }, { data: [] }]
  const hasClosed = (meetings ?? []).some((m) => m.status === "CLOSED")
  const outcomes = hasClosed ? await lotOutcomes(supabase, user.companyId) : null
  const today = todayISO()

  const rows = (meetings ?? []).map((m) => {
    const people = (participants ?? []).filter((p) => p.meeting_id === m.id).map((p) => p.name)
    const created = (tasks ?? []).filter((t) => t.meeting_id === m.id)
    const agenda = m.snapshot as unknown as MeetingAgenda | null
    const weekLots = agenda?.weeks[0]?.days.flatMap((d) => d.lots) ?? []
    // Missed = went out late, or still not out after its date (not-yet-due lots don't count).
    const late = outcomes
      ? weekLots.filter((l) => {
          const outcome = outcomes.get(l.key)
          return outcome === "late_done" || (outcome === "pending" && l.date < today)
        }).length
      : 0
    const decided = outcomes
      ? weekLots.filter((l) => outcomes.get(l.key) !== "pending" || l.date < today).length
      : 0
    const searchText = normalize(
      [
        formatDay(m.meeting_date, true),
        ...people,
        ...created.map((t) => t.title),
        ...Object.values((m.notes as Record<string, string>) ?? {}),
        ...weekLots.map((l) => `${l.customerName} ${l.orderNumber}`),
        ...(agenda?.late ?? []).map((l) => `${l.customerName} ${l.orderNumber}`),
        ...(agenda?.attention ?? []).map((a) => a.title),
      ].join(" "),
    )
    return {
      id: m.id,
      date: m.meeting_date,
      isOpen: m.status === "OPEN",
      isTest: m.is_test,
      people,
      createdCount: created.length,
      doneCount: created.filter((t) => t.status === "DONE").length,
      weekCount: weekLots.length,
      lateCount: late,
      decidedCount: decided,
      searchText,
    }
  })
  const filtered = q ? rows.filter((r) => r.searchText.includes(normalize(q))) : rows

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reuniões de alinhamento</h1>
          <p className="text-sm text-slate-500">
            Faturamento da semana, atrasos, pontos de atenção e pendências, com base nos pedidos do Flow.
          </p>
        </div>
        {canManageOperations(user.role) ? <NewMeetingButton /> : null}
      </div>

      <form className="flex max-w-md items-center gap-2" method="get">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={q ?? ""} placeholder="Buscar pedido, cliente ou assunto" className="pl-8" />
        </div>
        <Button type="submit" variant="secondary" size="sm">
          Buscar
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
              <CalendarDays className="size-8 text-slate-300" />
              {q ? "Nenhuma reunião encontrada para essa busca." : "Nenhuma reunião registrada ainda."}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/reunioes/${r.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50 md:grid-cols-[120px_minmax(0,1fr)_170px_150px_16px]"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-slate-900">
                      {formatDay(r.date, true)}
                      {r.isTest ? (
                        <span className="rounded border border-violet-200 bg-violet-50 px-1 text-[10px] font-semibold text-violet-700">
                          TESTE
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="size-4 text-slate-400 md:order-last" />
                    <span className="col-span-2 truncate text-sm text-slate-600 md:col-span-1">
                      {r.people.join(", ") || "—"}
                    </span>
                    <span className="text-xs text-slate-500 md:text-sm">
                      {r.isOpen ? (
                        <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          Em andamento
                        </span>
                      ) : (
                        `${plural(r.createdCount, "pendência criada", "pendências criadas")} · ${r.doneCount} concluídas`
                      )}
                    </span>
                    <span className="text-xs text-slate-500 md:text-sm">
                      {r.isOpen
                        ? ""
                        : r.weekCount === 0
                          ? "Sem entregas na semana"
                          : r.lateCount > 0
                            ? (
                                <>
                                  {plural(r.weekCount, "entrega", "entregas")} ·{" "}
                                  <span className="text-red-600">{r.lateCount} fora do prazo</span>
                                </>
                              )
                            : r.decidedCount < r.weekCount
                              ? `${plural(r.weekCount, "entrega", "entregas")} · ${r.weekCount - r.decidedCount} a vencer`
                              : `${plural(r.weekCount, "entrega", "entregas")} · no prazo`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
