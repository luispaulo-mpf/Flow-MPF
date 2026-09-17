import Link from "next/link"
import { requireUser, canEditTask, type CurrentUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { listActiveUsers } from "@/lib/queries"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { NewTaskDialog } from "@/components/tasks/new-task-dialog"
import { TaskRow, type TaskRowData } from "@/components/tasks/task-row"
import { isTaskDueToday, isTaskLate } from "@/lib/business-rules"

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requireUser()
  const params = await searchParams
  const tab = params.tab === "todas" ? "todas" : "minhas"

  const supabase = await createClient()
  const users = await listActiveUsers(user.companyId)

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, erp_order_number")
    .eq("company_id", user.companyId)
    .order("created_at", { ascending: false })
    .limit(200)

  const baseSelect =
    "id, title, description, status, priority, due_date, responsible_user_id, order_id, created_by, orders(erp_order_number), users:responsible_user_id(name)"

  let tasks: TaskRowData[] = []

  if (tab === "minhas") {
    const { data } = await supabase
      .from("tasks")
      .select(baseSelect)
      .eq("company_id", user.companyId)
      .eq("responsible_user_id", user.id)
      .order("due_date", { ascending: true, nullsFirst: false })
    tasks = (data ?? []) as unknown as TaskRowData[]
  } else {
    let query = supabase.from("tasks").select(baseSelect).eq("company_id", user.companyId)
    if (params.responsavel) query = query.eq("responsible_user_id", params.responsavel)
    if (params.status) query = query.eq("status", params.status)
    if (params.prioridade) query = query.eq("priority", params.prioridade)
    if (params.pedido) query = query.eq("order_id", params.pedido)
    if (params.prazo) query = query.eq("due_date", params.prazo)
    const { data } = await query.order("due_date", { ascending: true, nullsFirst: false })
    tasks = (data ?? []) as unknown as TaskRowData[]
  }

  const groups = {
    atrasadas: tasks.filter((t) => isTaskLate(t.due_date, t.status)),
    hoje: tasks.filter((t) => isTaskDueToday(t.due_date, t.status)),
    proximas: tasks.filter(
      (t) =>
        t.status !== "DONE" && !isTaskLate(t.due_date, t.status) && !isTaskDueToday(t.due_date, t.status),
    ),
    concluidas: tasks.filter((t) => t.status === "DONE"),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tarefas</h1>
          <p className="text-sm text-slate-500">{tasks.length} tarefas</p>
        </div>
        <NewTaskDialog users={users} orders={recentOrders ?? []} />
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        <Link
          href="/tarefas?tab=minhas"
          className={`px-3 py-2 text-sm font-medium ${tab === "minhas" ? "border-b-2 border-primary text-primary" : "text-slate-500"}`}
        >
          Minhas tarefas
        </Link>
        <Link
          href="/tarefas?tab=todas"
          className={`px-3 py-2 text-sm font-medium ${tab === "todas" ? "border-b-2 border-primary text-primary" : "text-slate-500"}`}
        >
          Todas as tarefas
        </Link>
      </div>

      {tab === "todas" ? (
        <Card>
          <CardContent className="pt-4">
            <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
              <input type="hidden" name="tab" value="todas" />
              <select
                name="responsavel"
                defaultValue={params.responsavel ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todos os responsáveis</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={params.status ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todos os status</option>
                <option value="TODO">A fazer</option>
                <option value="IN_PROGRESS">Em andamento</option>
                <option value="BLOCKED">Bloqueada</option>
                <option value="DONE">Concluída</option>
              </select>
              <select
                name="prioridade"
                defaultValue={params.prioridade ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todas as prioridades</option>
                <option value="LOW">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
              <select
                name="pedido"
                defaultValue={params.pedido ?? ""}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Todos os pedidos</option>
                {(recentOrders ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.erp_order_number}
                  </option>
                ))}
              </select>
              <Input name="prazo" type="date" defaultValue={params.prazo ?? ""} />
              <Button type="submit" variant="secondary" className="lg:col-span-5 sm:w-fit">
                Filtrar
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <TaskGroup title="Atrasadas" tasks={groups.atrasadas} users={users} currentUser={user} tone="text-red-600" />
      <TaskGroup title="Hoje" tasks={groups.hoje} users={users} currentUser={user} tone="text-amber-600" />
      <TaskGroup title="Próximas" tasks={groups.proximas} users={users} currentUser={user} />
      <TaskGroup title="Concluídas" tasks={groups.concluidas} users={users} currentUser={user} collapsedByDefault />
    </div>
  )
}

function TaskGroup({
  title,
  tasks,
  users,
  currentUser,
  tone,
  collapsedByDefault,
}: {
  title: string
  tasks: TaskRowData[]
  users: { id: string; name: string }[]
  currentUser: CurrentUser
  tone?: string
  collapsedByDefault?: boolean
}) {
  if (tasks.length === 0) return null

  return (
    <details open={!collapsedByDefault} className="rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-800">
        <span className={tone}>{title}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
          {tasks.length}
        </span>
      </summary>
      <ul className="divide-y divide-slate-100 border-t border-slate-100">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            users={users}
            canEdit={canEditTask(
              currentUser.role,
              task.responsible_user_id,
              task.created_by,
              currentUser.id,
            )}
          />
        ))}
      </ul>
    </details>
  )
}
