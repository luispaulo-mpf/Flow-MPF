"use client"

import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { createComment, type ActionResult } from "@/actions/comments"
import { MentionTextarea, type MentionUser } from "./mention-textarea"
import { cn } from "@/lib/utils"
import { formatDateTimeBR } from "@/lib/business-rules"

type Comment = {
  id: string
  content: string
  created_at: string
  user_id: string
  mentioned_user_ids: string[]
  users: { name: string } | null
}

type Me = { id: string; role: string }

const initialState: ActionResult = { error: null }

function formatDateTime(value: string) {
  return formatDateTimeBR(value)
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function CommentContent({
  content,
  mentioned,
  meId,
}: {
  content: string
  mentioned: MentionUser[]
  meId: string | null
}) {
  if (mentioned.length === 0) return <>{content}</>
  const byToken = new Map(mentioned.map((u) => [`@${u.name}`, u]))
  const pattern = new RegExp(
    `(${[...byToken.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|")})`,
    "g",
  )
  return (
    <>
      {content.split(pattern).map((part, i) => {
        const user = byToken.get(part)
        if (!user) return <Fragment key={i}>{part}</Fragment>
        return (
          <span
            key={i}
            className={cn(
              "rounded px-0.5 font-medium",
              user.id === meId ? "bg-primary/15 text-primary" : "text-primary",
            )}
          >
            {part}
          </span>
        )
      })}
    </>
  )
}

/**
 * Live conversation for an order or a task: loads its comments, re-loads on
 * every new comment (Supabase Realtime), marks the viewer's notifications for
 * this conversation as read, and lets them reply with @mentions.
 */
export function CommentThread({
  orderId,
  taskId,
  maxHeightClass = "max-h-[28rem]",
}: {
  orderId?: string
  taskId?: string
  maxHeightClass?: string
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [me, setMe] = useState<Me | null>(null)
  const [users, setUsers] = useState<MentionUser[]>([])
  const [comments, setComments] = useState<Comment[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const column = orderId ? "order_id" : "task_id"
  const targetId = orderId ?? taskId ?? ""

  const markRead = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq(column, targetId)
        .is("read_at", null)
        .select("id")
      // Refresh server-rendered unread counters (e.g. the Menções list).
      if (data && data.length > 0) router.refresh()
    },
    [supabase, column, targetId, router],
  )

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, mentioned_user_ids, users!comments_user_id_fkey(name)")
      .eq(column, targetId)
      .order("created_at", { ascending: true })
    // A failed read must never look like an empty conversation.
    setLoadError(error ? error.message : null)
    if (!error) setComments((data ?? []) as Comment[])
  }, [supabase, column, targetId])

  const [state, formAction, pending] = useActionState(
    async (prev: ActionResult, formData: FormData) => {
      const result = await createComment(prev, formData)
      if (!result.error) {
        setFormKey((k) => k + 1)
        load()
      }
      return result
    },
    initialState,
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user || cancelled) return
      const [{ data: profile }, { data: companyUsers }] = await Promise.all([
        supabase.from("users").select("id, role").eq("id", user.id).single(),
        supabase.from("users").select("id, name").eq("active", true).order("name"),
      ])
      if (cancelled) return
      if (profile) setMe(profile)
      setUsers(companyUsers ?? [])
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  useEffect(() => {
    if (!targetId) return
    const channel = supabase
      .channel(`comments:${column}:${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `${column}=eq.${targetId}` },
        () => {
          load()
        },
      )
      // Re-load once the live channel is up so nothing posted in between is missed.
      .subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") load()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, column, targetId, load])

  // Load right away too: the messages must never depend on the live channel
  // connecting (if it hangs, the conversation would otherwise stay empty).
  useEffect(() => {
    if (!targetId) return
    const timer = setTimeout(() => load(), 0)
    return () => clearTimeout(timer)
  }, [targetId, load])

  // Anything visible here counts as read — on open and whenever a new
  // comment arrives while the conversation is on screen.
  useEffect(() => {
    if (me && comments) markRead(me.id)
  }, [me, comments, markRead])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [comments])

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const mentionCandidates = useMemo(() => users.filter((u) => u.id !== me?.id), [users, me])
  const canComment = me !== null && me.role !== "VISUALIZACAO"

  return (
    <div className="flex flex-col gap-3">
      <div ref={listRef} className={cn("flex flex-col gap-2 overflow-y-auto pr-1", maxHeightClass)}>
        {loadError ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
            Não foi possível carregar as mensagens (elas continuam salvas).
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => load()}>
              Tentar de novo
            </Button>
          </div>
        ) : null}
        {comments === null ? (
          loadError ? null : <p className="text-sm text-slate-400">Carregando...</p>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum comentário ainda. Use @ para chamar alguém para a conversa.
          </p>
        ) : (
          comments.map((c) => {
            const mine = c.user_id === me?.id
            const mentioned = c.mentioned_user_ids
              .map((id) => usersById.get(id))
              .filter((u): u is MentionUser => Boolean(u))
            return (
              <div
                key={c.id}
                className={cn(
                  "max-w-[85%] rounded-lg p-2.5 text-sm",
                  mine ? "self-end bg-primary/10" : "self-start bg-slate-100",
                )}
              >
                <div className="mb-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {mine ? "Você" : (c.users?.name ?? "Usuário")}
                  </span>
                  <span>{formatDateTime(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-slate-800">
                  <CommentContent content={c.content} mentioned={mentioned} meId={me?.id ?? null} />
                </p>
              </div>
            )
          })
        )}
      </div>

      {canComment ? (
        <form action={formAction} className="flex flex-col gap-2">
          {orderId ? <input type="hidden" name="order_id" value={orderId} /> : null}
          {taskId ? <input type="hidden" name="task_id" value={taskId} /> : null}
          <MentionTextarea
            key={formKey}
            users={mentionCandidates}
            placeholder="Escreva uma mensagem... use @ para mencionar alguém"
          />
          <div className="flex items-center justify-between gap-2">
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : (
              <span className="text-xs text-slate-400">Ctrl + Enter para enviar</span>
            )}
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
