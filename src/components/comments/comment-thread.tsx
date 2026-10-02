"use client"

import { Fragment, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { createComment, type ActionResult } from "@/actions/comments"
import { MentionTextarea, type MentionUser } from "./mention-textarea"
import { CommentReactions, type Reaction } from "./comment-reactions"
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
  const [reactions, setReactions] = useState<Reaction[]>([])
  const commentIdsRef = useRef<string[]>([])
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

  const loadReactions = useCallback(async () => {
    const ids = commentIdsRef.current
    if (ids.length === 0) return setReactions([])
    const { data } = await supabase
      .from("comment_reactions")
      .select("comment_id, user_id, emoji")
      .in("comment_id", ids)
      .order("created_at", { ascending: true })
    setReactions(data ?? [])
  }, [supabase])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("comments")
      .select("id, content, created_at, user_id, mentioned_user_ids, users(name)")
      .eq(column, targetId)
      .order("created_at", { ascending: true })
    commentIdsRef.current = (data ?? []).map((c) => c.id)
    setComments((data ?? []) as Comment[])
    loadReactions()
  }, [supabase, column, targetId, loadReactions])

  // Optimistic toggle of the viewer's own reaction; the realtime echo re-syncs.
  const toggleReaction = useCallback(
    async (commentId: string, emoji: string) => {
      if (!me) return
      const matches = (r: Reaction) => r.comment_id === commentId && r.user_id === me.id && r.emoji === emoji
      const exists = reactions.some(matches)
      setReactions((prev) =>
        exists ? prev.filter((r) => !matches(r)) : [...prev, { comment_id: commentId, user_id: me.id, emoji }],
      )
      const { error } = exists
        ? await supabase
            .from("comment_reactions")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", me.id)
            .eq("emoji", emoji)
        : await supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: me.id, emoji })
      if (error) loadReactions()
    },
    [supabase, me, reactions, loadReactions],
  )

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
      // Delete events can't be filtered by thread: re-read this thread's reactions on any change.
      .on("postgres_changes", { event: "*", schema: "public", table: "comment_reactions" }, () => {
        loadReactions()
      })
      // Load once the live channel is up so nothing posted in between is missed.
      .subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") load()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, column, targetId, load, loadReactions])

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
        {comments === null ? (
          <p className="text-sm text-slate-400">Carregando...</p>
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
              <div key={c.id} className={cn("group flex max-w-[85%] flex-col", mine ? "self-end" : "self-start")}>
                <div className={cn("rounded-lg p-2.5 text-sm", mine ? "bg-primary/10" : "bg-slate-100")}>
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
                <CommentReactions
                  reactions={reactions.filter((r) => r.comment_id === c.id)}
                  meId={me?.id ?? null}
                  canReact={canComment}
                  nameOf={(id) => usersById.get(id)?.name ?? "Usuário"}
                  onToggle={(emoji) => toggleReaction(c.id, emoji)}
                  alignEnd={mine}
                />
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
