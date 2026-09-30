"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { requireUser, canManageOperations } from "@/lib/auth"
import { logActivity } from "@/lib/activity-log"
import { computeAgenda, MEETING_AREAS } from "@/lib/meetings"

/** ADMIN/GESTOR conduct meetings; a closed meeting never changes. */
async function assertCanConduct(meetingId: string) {
  const user = await requireUser()
  if (!canManageOperations(user.role)) throw new Error("Você não tem permissão para conduzir reuniões.")
  const supabase = await createClient()
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id, company_id, meeting_date, status, notes, is_test")
    .eq("id", meetingId)
    .eq("company_id", user.companyId)
    .single()
  if (!meeting) throw new Error("Reunião não encontrada.")
  if (meeting.status !== "OPEN") throw new Error("Esta reunião já foi encerrada.")
  return { user, supabase, meeting }
}

async function listTestMeetingIds(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string) {
  const { data } = await supabase
    .from("meetings")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_test", true)
  return new Set((data ?? []).map((m) => m.id))
}

/** Deletes a test meeting and every pendência created in it (real ones can't be deleted). */
export async function deleteTestMeeting(meetingId: string) {
  const user = await requireUser()
  if (!canManageOperations(user.role)) throw new Error("Você não tem permissão.")
  const supabase = await createClient()
  const { error } = await supabase.rpc("delete_test_meeting", { p_meeting_id: meetingId })
  if (error) throw new Error("Não foi possível excluir a reunião de teste.")
  revalidatePath("/reunioes")
  revalidatePath("/tarefas")
  redirect("/reunioes")
}

function refresh(meetingId: string) {
  revalidatePath(`/reunioes/${meetingId}`)
  revalidatePath("/reunioes")
}

export async function createMeeting(meetingDate: string, isTest = false) {
  const user = await requireUser()
  if (!canManageOperations(user.role)) throw new Error("Você não tem permissão para criar reuniões.")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) throw new Error("Data inválida.")
  const supabase = await createClient()

  // One real meeting per date; test meetings can share any date.
  if (!isTest) {
    const { data: existing } = await supabase
      .from("meetings")
      .select("id")
      .eq("company_id", user.companyId)
      .eq("meeting_date", meetingDate)
      .eq("is_test", false)
      .maybeSingle()
    if (existing) redirect(`/reunioes/${existing.id}`)
  }

  const { data: meeting, error } = await supabase
    .from("meetings")
    .insert({ company_id: user.companyId, meeting_date: meetingDate, created_by: user.id, is_test: isTest })
    .select("id")
    .single()
  if (error || !meeting) throw new Error("Não foi possível criar a reunião.")

  // Same people as the last real meeting; adjust in the meeting if needed.
  const { data: previous } = await supabase
    .from("meetings")
    .select("id")
    .eq("company_id", user.companyId)
    .eq("is_test", false)
    .lte("meeting_date", meetingDate)
    .neq("id", meeting.id)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (previous) {
    const { data: people } = await supabase
      .from("meeting_participants")
      .select("user_id, name")
      .eq("meeting_id", previous.id)
    if (people && people.length > 0) {
      await supabase
        .from("meeting_participants")
        .insert(people.map((p) => ({ meeting_id: meeting.id, user_id: p.user_id, name: p.name })))
    }
  } else {
    await supabase
      .from("meeting_participants")
      .insert({ meeting_id: meeting.id, user_id: user.id, name: user.name })
  }

  revalidatePath("/reunioes")
  redirect(`/reunioes/${meeting.id}`)
}

export async function addParticipant(meetingId: string, input: { userId?: string; name?: string }) {
  const { supabase, user } = await assertCanConduct(meetingId)
  let name = (input.name ?? "").trim()
  let userId: string | null = null
  if (input.userId) {
    const { data: participant } = await supabase
      .from("users")
      .select("id, name")
      .eq("id", input.userId)
      .eq("company_id", user.companyId)
      .single()
    if (!participant) throw new Error("Usuário não encontrado.")
    userId = participant.id
    name = participant.name
  }
  if (!name) throw new Error("Informe o nome do participante.")
  await supabase.from("meeting_participants").insert({ meeting_id: meetingId, user_id: userId, name })
  refresh(meetingId)
}

export async function removeParticipant(meetingId: string, participantId: string) {
  const { supabase } = await assertCanConduct(meetingId)
  await supabase.from("meeting_participants").delete().eq("id", participantId).eq("meeting_id", meetingId)
  refresh(meetingId)
}

export async function saveMeetingNotes(meetingId: string, area: string, text: string) {
  const { supabase, meeting } = await assertCanConduct(meetingId)
  if (!MEETING_AREAS.some((a) => a.key === area)) throw new Error("Área inválida.")
  const notes = { ...((meeting.notes as Record<string, string>) ?? {}), [area]: text }
  const { error } = await supabase.from("meetings").update({ notes }).eq("id", meetingId)
  if (error) throw new Error("Não foi possível salvar a anotação.")
  refresh(meetingId)
}

export async function saveOrderNote(
  meetingId: string,
  input: {
    orderId: string
    deliveryDate: string
    committed: boolean
    reason: string
    forecastDate: string | null
  },
) {
  const { supabase, user } = await assertCanConduct(meetingId)
  const { error } = await supabase.from("meeting_order_notes").upsert(
    {
      meeting_id: meetingId,
      order_id: input.orderId,
      delivery_date: input.deliveryDate,
      committed: input.committed,
      reason: input.reason.trim() || null,
      forecast_date: input.forecastDate || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "meeting_id,order_id,delivery_date" },
  )
  if (error) throw new Error("Não foi possível salvar.")
  refresh(meetingId)
}

export async function createMeetingTask(
  meetingId: string,
  input: {
    area: string
    title: string
    responsibleUserId: string | null
    dueDate: string | null
    orderId: string | null
  },
) {
  const { supabase, user } = await assertCanConduct(meetingId)
  const title = input.title.trim()
  if (!title) throw new Error("Descreva a pendência.")
  if (!MEETING_AREAS.some((a) => a.key === input.area)) throw new Error("Área inválida.")

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      company_id: user.companyId,
      title,
      order_id: input.orderId || null,
      responsible_user_id: input.responsibleUserId || null,
      due_date: input.dueDate || null,
      created_by: user.id,
      meeting_id: meetingId,
      meeting_area: input.area,
    })
    .select("id")
    .single()
  if (error || !task) throw new Error("Não foi possível criar a pendência.")

  await logActivity(supabase, {
    companyId: user.companyId,
    userId: user.id,
    orderId: input.orderId || null,
    taskId: task.id,
    action: "Tarefa criada",
    description: `Pendência "${title}" criada na reunião de alinhamento.`,
  })

  refresh(meetingId)
  revalidatePath("/tarefas")
  if (input.orderId) revalidatePath(`/pedidos/${input.orderId}`)
}

/**
 * Freezes the meeting: stores the agenda as it stood (billing, late orders,
 * attention points) and each discussed pendência's status at that moment.
 */
export async function closeMeeting(meetingId: string) {
  const { supabase, user, meeting } = await assertCanConduct(meetingId)

  const agenda = await computeAgenda(supabase, user.companyId, meeting.meeting_date)

  const { data: previous } = await supabase
    .from("meetings")
    .select("meeting_date")
    .eq("company_id", user.companyId)
    .eq("is_test", false)
    .lt("meeting_date", meeting.meeting_date)
    .order("meeting_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  const [{ data: tasks }, testMeetingIds] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, status, completed_at, meeting_id")
      .eq("company_id", user.companyId)
      .not("meeting_area", "is", null),
    listTestMeetingIds(supabase, user.companyId),
  ])
  const discussed = (tasks ?? []).filter(
    (t) =>
      (t.meeting_id === meetingId ||
        meeting.is_test ||
        !testMeetingIds.has(t.meeting_id ?? "")) &&
      (t.status !== "DONE" ||
        t.meeting_id === meetingId ||
        (t.completed_at && previous && t.completed_at.slice(0, 10) >= previous.meeting_date)),
  )
  if (discussed.length > 0) {
    await supabase.from("meeting_task_reviews").upsert(
      discussed.map((t) => ({ meeting_id: meetingId, task_id: t.id, status_at_meeting: t.status })),
      { onConflict: "meeting_id,task_id" },
    )
  }

  const { error } = await supabase
    .from("meetings")
    .update({
      status: "CLOSED",
      snapshot: agenda,
      closed_by: user.id,
      closed_at: new Date().toISOString(),
    })
    .eq("id", meetingId)
  if (error) throw new Error("Não foi possível encerrar a reunião.")
  refresh(meetingId)
}
