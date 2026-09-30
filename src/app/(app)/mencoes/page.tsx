import Link from "next/link"
import { ArrowLeft, ClipboardList, ListChecks, MessagesSquare } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CommentThread } from "@/components/comments/comment-thread"
import { cn } from "@/lib/utils"
import { brDate } from "@/lib/business-rules"

type Thread = {
  key: string
  kind: "pedido" | "tarefa"
  id: string
  title: string
  subtitle: string
  lastContent: string
  lastAuthor: string
  lastAt: string
  unread: number
}

function formatWhen(value: string) {
  const date = new Date(value)
  const sameDay = brDate(date) === brDate()
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    ...(sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "2-digit" }),
  })
}

export default async function MencoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const params = await searchParams
  const supabase = await createClient()

  // Conversations I'm part of: I was notified about them or I commented.
  const [{ data: myNotifications }, { data: myComments }] = await Promise.all([
    supabase
      .from("notifications")
      .select("order_id, task_id, read_at")
      .eq("user_id", user.id)
      .in("kind", ["MENTION", "REPLY"])
      .order("created_at", { ascending: false })
      .limit(2000),
    supabase.from("comments").select("order_id, task_id").eq("user_id", user.id).limit(2000),
  ])

  const orderIds = new Set<string>()
  const taskIds = new Set<string>()
  const unreadByKey = new Map<string, number>()
  for (const n of myNotifications ?? []) {
    const key = n.task_id ? `tarefa:${n.task_id}` : `pedido:${n.order_id}`
    if (n.task_id) taskIds.add(n.task_id)
    else if (n.order_id) orderIds.add(n.order_id)
    if (!n.read_at) unreadByKey.set(key, (unreadByKey.get(key) ?? 0) + 1)
  }
  for (const c of myComments ?? []) {
    if (c.task_id) taskIds.add(c.task_id)
    else if (c.order_id) orderIds.add(c.order_id)
  }

  const selected = params.tarefa
    ? { kind: "tarefa" as const, id: params.tarefa }
    : params.pedido
      ? { kind: "pedido" as const, id: params.pedido }
      : null
  if (selected?.kind === "tarefa") taskIds.add(selected.id)
  if (selected?.kind === "pedido") orderIds.add(selected.id)

  const commentSelect = "content, created_at, order_id, task_id, users(name)"
  const [orderComments, taskComments, orders, tasks] = await Promise.all([
    orderIds.size
      ? supabase
          .from("comments")
          .select(commentSelect)
          .in("order_id", [...orderIds])
          .order("created_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
    taskIds.size
      ? supabase
          .from("comments")
          .select(commentSelect)
          .in("task_id", [...taskIds])
          .order("created_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [] }),
    orderIds.size
      ? supabase
          .from("orders")
          .select("id, erp_order_number, customer_name")
          .eq("company_id", user.companyId)
          .in("id", [...orderIds])
      : Promise.resolve({ data: [] }),
    taskIds.size
      ? supabase
          .from("tasks")
          .select("id, title, order_id, orders(erp_order_number)")
          .eq("company_id", user.companyId)
          .in("id", [...taskIds])
      : Promise.resolve({ data: [] }),
  ])

  const latestByKey = new Map<string, { content: string; created_at: string; author: string }>()
  for (const c of [...(orderComments.data ?? []), ...(taskComments.data ?? [])]) {
    const key = c.task_id ? `tarefa:${c.task_id}` : `pedido:${c.order_id}`
    const current = latestByKey.get(key)
    if (!current || c.created_at > current.created_at) {
      latestByKey.set(key, {
        content: c.content,
        created_at: c.created_at,
        author: (c.users as { name: string } | null)?.name ?? "Usuário",
      })
    }
  }

  const threads: Thread[] = []
  for (const o of orders.data ?? []) {
    const key = `pedido:${o.id}`
    const last = latestByKey.get(key)
    if (!last) continue
    threads.push({
      key,
      kind: "pedido",
      id: o.id,
      title: `Pedido ${o.erp_order_number}`,
      subtitle: o.customer_name,
      lastContent: last.content,
      lastAuthor: last.author,
      lastAt: last.created_at,
      unread: unreadByKey.get(key) ?? 0,
    })
  }
  for (const t of tasks.data ?? []) {
    const key = `tarefa:${t.id}`
    const last = latestByKey.get(key)
    if (!last) continue
    const orderNumber = (t.orders as { erp_order_number: string } | null)?.erp_order_number
    threads.push({
      key,
      kind: "tarefa",
      id: t.id,
      title: t.title,
      subtitle: orderNumber ? `Tarefa · Pedido ${orderNumber}` : "Tarefa",
      lastContent: last.content,
      lastAuthor: last.author,
      lastAt: last.created_at,
      unread: unreadByKey.get(key) ?? 0,
    })
  }
  threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))

  // Header for the open conversation (it may have no comments yet).
  let openTitle: string | null = null
  let openSubtitle: string | null = null
  let openLink: { href: string; label: string } | null = null
  if (selected?.kind === "pedido") {
    const o = (orders.data ?? []).find((x) => x.id === selected.id)
    if (o) {
      openTitle = `Pedido ${o.erp_order_number}`
      openSubtitle = o.customer_name
      openLink = { href: `/pedidos/${o.id}`, label: "Abrir pedido" }
    }
  } else if (selected?.kind === "tarefa") {
    const t = (tasks.data ?? []).find((x) => x.id === selected.id)
    if (t) {
      const orderNumber = (t.orders as { erp_order_number: string } | null)?.erp_order_number
      openTitle = t.title
      openSubtitle = orderNumber ? `Tarefa do pedido ${orderNumber}` : "Tarefa"
      openLink = t.order_id
        ? { href: `/pedidos/${t.order_id}`, label: `Abrir pedido ${orderNumber ?? ""}` }
        : { href: "/tarefas?tab=todas", label: "Abrir tarefas" }
    }
  }

  const totalUnread = threads.reduce((sum, t) => sum + t.unread, 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Menções</h1>
        <p className="text-sm text-slate-500">
          Conversas de pedidos e tarefas em que você foi mencionado ou participou
          {totalUnread > 0 ? ` · ${totalUnread} não lidas` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className={cn("lg:col-span-2", selected && "hidden lg:flex")}>
          <CardContent className="p-0">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
                <MessagesSquare className="size-8 text-slate-300" />
                Nenhuma conversa ainda. Quando alguém mencionar você com @ em um pedido ou tarefa, a
                conversa aparece aqui.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {threads.map((t) => {
                  const active = selected?.kind === t.kind && selected.id === t.id
                  const Icon = t.kind === "pedido" ? ClipboardList : ListChecks
                  return (
                    <li key={t.key}>
                      <Link
                        href={`/mencoes?${t.kind}=${t.id}`}
                        className={cn(
                          "flex gap-3 px-4 py-3 hover:bg-slate-50",
                          active && "bg-primary/5",
                        )}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p
                              className={cn(
                                "truncate text-sm",
                                t.unread ? "font-semibold text-slate-900" : "font-medium text-slate-700",
                              )}
                            >
                              {t.title}
                            </p>
                            <span className="shrink-0 text-xs text-slate-400">{formatWhen(t.lastAt)}</span>
                          </div>
                          <p className="truncate text-xs text-slate-400">{t.subtitle}</p>
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs text-slate-600">
                              <span className="font-medium">{t.lastAuthor}:</span> {t.lastContent}
                            </p>
                            {t.unread ? (
                              <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                {t.unread}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className={cn("lg:col-span-3", !selected && "hidden lg:flex")}>
          {selected && openTitle ? (
            <>
              <CardHeader className="gap-1">
                <Link
                  href="/mencoes"
                  className="mb-1 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 lg:hidden"
                >
                  <ArrowLeft className="size-3.5" />
                  Voltar para conversas
                </Link>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">{openTitle}</CardTitle>
                    <p className="truncate text-xs text-slate-500">{openSubtitle}</p>
                  </div>
                  {openLink ? (
                    <Link href={openLink.href} className="shrink-0 text-xs font-medium text-primary hover:underline">
                      {openLink.label}
                    </Link>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <CommentThread
                  key={`${selected.kind}:${selected.id}`}
                  orderId={selected.kind === "pedido" ? selected.id : undefined}
                  taskId={selected.kind === "tarefa" ? selected.id : undefined}
                  maxHeightClass="max-h-[60vh]"
                />
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center text-sm text-slate-500">
              <MessagesSquare className="size-8 text-slate-300" />
              {selected ? "Conversa não encontrada." : "Selecione uma conversa para ver e responder."}
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  )
}
