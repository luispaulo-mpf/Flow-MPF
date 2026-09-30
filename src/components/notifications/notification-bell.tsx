"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AtSign, Bell, ClipboardCheck, MessageSquare } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type Notification = {
  id: string
  kind: string
  read_at: string | null
  created_at: string
  order_id: string | null
  task_id: string | null
  actor: { name: string } | null
  comments: { content: string } | null
  orders: { erp_order_number: string } | null
  tasks: { title: string } | null
}

export function conversationHref(n: { kind?: string; order_id: string | null; task_id: string | null }) {
  if (n.kind === "TASK_ASSIGNED") return "/tarefas?tab=minhas"
  return n.task_id ? `/mencoes?tarefa=${n.task_id}` : `/mencoes?pedido=${n.order_id}`
}

function timeAgo(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)
  if (minutes < 1) return "agora"
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
}

function describe(n: Notification) {
  const who = n.actor?.name ?? "Alguém"
  if (n.kind === "TASK_ASSIGNED") {
    const order = n.orders ? ` · pedido ${n.orders.erp_order_number}` : ""
    return `${who} atribuiu a você a tarefa "${n.tasks?.title ?? ""}"${order}`
  }
  const where = n.tasks ? `na tarefa "${n.tasks.title}"` : `no pedido ${n.orders?.erp_order_number ?? ""}`
  return n.kind === "MENTION" ? `${who} mencionou você ${where}` : `${who} comentou ${where}`
}

/**
 * Header bell: unread count + latest notifications, kept live through
 * Supabase Realtime (database triggers insert rows for new comments and for
 * task assignments).
 */
export function NotificationBell({ userId }: { userId: string }) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, kind, read_at, created_at, order_id, task_id, actor:users!notifications_actor_id_fkey(name), comments(content), orders(erp_order_number), tasks(title)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null),
    ])
    setItems((data ?? []) as unknown as Notification[])
    setUnread(count ?? 0)
  }, [supabase, userId])

  useEffect(() => {
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => {
          load()
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") load()
      })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, userId, load])

  async function markRead(id: string) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id)
    load()
  }

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null)
    load()
    router.refresh()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">Notificações</span>
          {unread > 0 ? (
            <button type="button" onClick={markAllRead} className="text-xs text-primary hover:underline">
              Marcar todas como lidas
            </button>
          ) : null}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-slate-500">Nenhuma notificação.</li>
          ) : (
            items.map((n) => (
              <li key={n.id}>
                <Link
                  href={conversationHref(n)}
                  onClick={() => {
                    setOpen(false)
                    if (!n.read_at) markRead(n.id)
                  }}
                  className={cn(
                    "flex gap-2 border-b border-slate-100 px-3 py-2.5 hover:bg-slate-50",
                    !n.read_at && "bg-primary/5",
                  )}
                >
                  {n.kind === "MENTION" ? (
                    <AtSign className="mt-0.5 size-4 shrink-0 text-primary" />
                  ) : n.kind === "TASK_ASSIGNED" ? (
                    <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
                  ) : (
                    <MessageSquare className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read_at ? "font-medium text-slate-900" : "text-slate-600")}>
                      {describe(n)}
                    </p>
                    {n.comments?.content ? (
                      <p className="line-clamp-2 text-xs text-slate-500">{n.comments.content}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-slate-400">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read_at ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                </Link>
              </li>
            ))
          )}
        </ul>
        <Link
          href="/mencoes"
          onClick={() => setOpen(false)}
          className="block px-3 py-2 text-center text-xs font-medium text-primary hover:bg-slate-50"
        >
          Ver todas as conversas
        </Link>
      </PopoverContent>
    </Popover>
  )
}
