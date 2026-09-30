import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { requireUser, canManageOperations } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listActiveUsers } from "@/lib/queries"
import { computeAgenda, lotOutcomes, type MeetingAgenda } from "@/lib/meetings"
import { todayISO } from "@/lib/business-rules"
import { MeetingHeader } from "./meeting-header"
import { LateLots } from "./late-lots"
import { BillingWeeks } from "./billing-weeks"
import { AttentionPoints } from "./attention-points"
import { Pendencias, type Pendencia } from "./pendencias"
import { AreaNotes } from "./area-notes"
import type { LotNote } from "./lot-note-dialog"

export default async function ReuniaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, meeting_date, status, notes, snapshot, closed_at, closed_by, created_by, is_test")
    .eq("id", id)
    .eq("company_id", user.companyId)
    .single()
  if (!meeting) notFound()

  const isOpen = meeting.status === "OPEN"
  const canConduct = isOpen && canManageOperations(user.role)

  const [
    { data: participants },
    users,
    { data: orders },
    { data: previousMeeting },
    { data: closer },
    { data: testMeetings },
  ] = await Promise.all([
      supabase
        .from("meeting_participants")
        .select("id, name, user_id")
        .eq("meeting_id", id)
        .order("created_at", { ascending: true }),
      listActiveUsers(user.companyId),
      supabase
        .from("orders")
        .select("id, erp_order_number, customer_name")
        .eq("company_id", user.companyId)
        .is("archived_at", null)
        .order("erp_order_number", { ascending: false }),
      supabase
        .from("meetings")
        .select("meeting_date")
        .eq("company_id", user.companyId)
        .eq("is_test", false)
        .lt("meeting_date", meeting.meeting_date)
        .order("meeting_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      meeting.closed_by
        ? supabase.from("users").select("name").eq("id", meeting.closed_by).single()
        : Promise.resolve({ data: null }),
      supabase.from("meetings").select("id").eq("company_id", user.companyId).eq("is_test", true),
    ])
  // Test meetings never feed real ones (notes, pendências); a test meeting sees everything.
  const testMeetingIds = new Set((testMeetings ?? []).map((m) => m.id))
  const fromOtherTest = (meetingId: string | null) =>
    !meeting.is_test && meetingId !== id && testMeetingIds.has(meetingId ?? "")

  // Open: live from the orders. Closed: exactly as it stood when closed.
  const agenda: MeetingAgenda =
    isOpen || !meeting.snapshot
      ? await computeAgenda(supabase, user.companyId, meeting.meeting_date)
      : (meeting.snapshot as unknown as MeetingAgenda)

  // ---- Order lot notes (committed / reason / forecast) ----
  const lotOrderIds = [
    ...new Set([
      ...agenda.late.map((l) => l.orderId),
      ...agenda.weeks.flatMap((w) => w.days.flatMap((d) => d.lots.map((l) => l.orderId))),
    ]),
  ]
  const { data: notesRows } = lotOrderIds.length
    ? await supabase
        .from("meeting_order_notes")
        .select("meeting_id, order_id, delivery_date, committed, reason, forecast_date, meetings(meeting_date)")
        .in("order_id", lotOrderIds)
    : { data: [] }
  // For each lot: this meeting's note, else the latest one from an earlier
  // meeting (so a reason given last week is still shown this week).
  const lotNotes: Record<string, LotNote> = {}
  for (const row of notesRows ?? []) {
    const rowDate = (row.meetings as { meeting_date: string } | null)?.meeting_date ?? ""
    if (rowDate > meeting.meeting_date || fromOtherTest(row.meeting_id)) continue
    const key = `${row.order_id}|${row.delivery_date}`
    const current = lotNotes[key]
    const isThis = row.meeting_id === id
    const newer = !current || (!current.fromThisMeeting && rowDate > current.meetingDate)
    if (isThis || newer) {
      lotNotes[key] = {
        committed: row.committed,
        reason: row.reason,
        forecastDate: row.forecast_date,
        meetingDate: rowDate,
        fromThisMeeting: isThis,
      }
    }
  }

  // ---- Pendências ----
  const taskSelect =
    "id, title, status, due_date, completed_at, meeting_area, meeting_id, order_id, responsible_user_id, created_by, users:responsible_user_id(name), orders(erp_order_number, customer_name)"
  let pendencias: Pendencia[] = []
  if (isOpen) {
    const { data } = await supabase
      .from("tasks")
      .select(taskSelect)
      .eq("company_id", user.companyId)
      .not("meeting_area", "is", null)
    pendencias = ((data ?? []) as unknown as Pendencia[]).filter(
      (t) =>
        !fromOtherTest(t.meeting_id) &&
        (t.status !== "DONE" ||
          t.meeting_id === id ||
          Boolean(
            t.completed_at && previousMeeting && t.completed_at.slice(0, 10) >= previousMeeting.meeting_date,
          )),
    )
  } else {
    const { data: reviews } = await supabase
      .from("meeting_task_reviews")
      .select("task_id, status_at_meeting")
      .eq("meeting_id", id)
    const statusAtMeeting = new Map((reviews ?? []).map((r) => [r.task_id, r.status_at_meeting]))
    const { data } = await supabase
      .from("tasks")
      .select(taskSelect)
      .eq("company_id", user.companyId)
      .or(`meeting_id.eq.${id}${statusAtMeeting.size ? `,id.in.(${[...statusAtMeeting.keys()].join(",")})` : ""}`)
    pendencias = ((data ?? []) as unknown as Pendencia[]).map((t) => ({
      ...t,
      statusAtMeeting: statusAtMeeting.get(t.id) ?? null,
    }))
  }

  // "Discutida em": the meeting that created it + every closed meeting that reviewed it.
  const pendenciaIds = pendencias.map((p) => p.id)
  const { data: allReviews } = pendenciaIds.length
    ? await supabase
        .from("meeting_task_reviews")
        .select("task_id, meetings(meeting_date)")
        .in("task_id", pendenciaIds)
    : { data: [] }
  const { data: originMeetings } = await supabase
    .from("meetings")
    .select("id, meeting_date")
    .in("id", [...new Set(pendencias.map((p) => p.meeting_id).filter(Boolean))] as string[])
  const originDate = new Map((originMeetings ?? []).map((m) => [m.id, m.meeting_date]))
  const discussedOn = new Map<string, Set<string>>()
  for (const p of pendencias) {
    const set = new Set<string>()
    const origin = p.meeting_id ? originDate.get(p.meeting_id) : null
    if (origin) set.add(origin)
    discussedOn.set(p.id, set)
  }
  for (const r of allReviews ?? []) {
    const date = (r.meetings as { meeting_date: string } | null)?.meeting_date
    if (date && date <= meeting.meeting_date) discussedOn.get(r.task_id)?.add(date)
  }
  pendencias = pendencias.map((p) => ({
    ...p,
    discussedOn: [...(discussedOn.get(p.id) ?? [])].sort(),
  }))

  const outcomes = isOpen ? null : Object.fromEntries(await lotOutcomes(supabase, user.companyId))

  const notes = (meeting.notes as Record<string, string>) ?? {}
  const userOptions = users.map((u) => ({ id: u.id, name: u.name }))
  const orderOptions = (orders ?? []).map((o) => ({
    id: o.id,
    label: `${o.erp_order_number} · ${o.customer_name}`,
  }))

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/reunioes"
        className="flex w-fit items-center gap-1 text-sm text-slate-500 hover:text-slate-800 print:hidden"
      >
        <ArrowLeft className="size-4" />
        Reuniões
      </Link>

      <MeetingHeader
        meetingId={id}
        meetingDate={meeting.meeting_date}
        isOpen={isOpen}
        isTest={meeting.is_test}
        canConduct={canConduct}
        canDeleteTest={meeting.is_test && canManageOperations(user.role)}
        closedAt={meeting.closed_at}
        closedByName={closer?.name ?? null}
        participants={participants ?? []}
        users={userOptions}
      />

      <LateLots
        meetingId={id}
        lots={agenda.late}
        notes={lotNotes}
        canConduct={canConduct}
        outcomes={outcomes}
      />

      <BillingWeeks
        meetingId={id}
        weeks={agenda.weeks}
        notes={lotNotes}
        canConduct={canConduct}
        outcomes={outcomes}
        today={todayISO()}
      />

      <AttentionPoints
        meetingId={id}
        points={agenda.attention}
        canConduct={canConduct}
        users={userOptions}
        orders={orderOptions}
      />

      <Pendencias
        meetingId={id}
        pendencias={pendencias}
        isOpen={isOpen}
        canConduct={canConduct}
        users={userOptions}
        orders={orderOptions}
      />

      <AreaNotes meetingId={id} notes={notes} canConduct={canConduct} />
    </div>
  )
}
