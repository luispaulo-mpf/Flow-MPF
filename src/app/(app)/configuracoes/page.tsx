import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusList } from "./status-list"
import { NewStatusForm } from "./new-status-form"

export default async function ConfiguracoesPage() {
  const user = await requireUser()
  if (user.role !== "ADMIN") redirect("/dashboard")

  const supabase = await createClient()
  const [{ data: company }, { data: statuses }] = await Promise.all([
    supabase.from("companies").select("id, name").eq("id", user.companyId).single(),
    supabase
      .from("statuses")
      .select("id, name, position, color, is_final, active")
      .eq("company_id", user.companyId)
      .order("position", { ascending: true }),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">{company?.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status de pedidos</CardTitle>
          <CardDescription>
            Controle os status disponíveis no Kanban e nos filtros de pedidos. Marque
            &quot;final&quot; para status que representam pedido concluído.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StatusList statuses={statuses ?? []} />
          <NewStatusForm nextPosition={(statuses?.length ?? 0) + 1} />
        </CardContent>
      </Card>
    </div>
  )
}
