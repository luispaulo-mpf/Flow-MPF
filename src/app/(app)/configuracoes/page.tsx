import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { listStatuses } from "@/lib/queries"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusList } from "./status-list"
import { NewStatusForm } from "./new-status-form"
import { CompanySettingsForm } from "./company-settings-form"

export default async function ConfiguracoesPage() {
  const user = await requireUser()
  if (user.role !== "ADMIN") redirect("/dashboard")

  const supabase = await createClient()
  const [{ data: company }, orderStatuses, itemStatuses] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, production_capacity_monthly, risk_window_days")
      .eq("id", user.companyId)
      .single(),
    listStatuses(user.companyId, "ORDER"),
    listStatuses(user.companyId, "ITEM"),
  ])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">{company?.name}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capacidade e prazos</CardTitle>
          <CardDescription>
            Usados nos indicadores do painel: carga de produção e alerta de pedidos com prazo
            próximo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompanySettingsForm
            productionCapacityMonthly={company?.production_capacity_monthly ?? 500}
            riskWindowDays={company?.risk_window_days ?? 2}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status de pedidos</CardTitle>
          <CardDescription>
            Controle os status disponíveis no Kanban e nos filtros de pedidos. Marque
            &quot;final&quot; para status que representam pedido concluído.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StatusList statuses={orderStatuses} scope="ORDER" />
          <NewStatusForm nextPosition={orderStatuses.length + 1} scope="ORDER" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status de itens</CardTitle>
          <CardDescription>
            Controle os status disponíveis para cada item dentro de um pedido (ex.: em corte,
            em produção, pronto).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StatusList statuses={itemStatuses} scope="ITEM" />
          <NewStatusForm nextPosition={itemStatuses.length + 1} scope="ITEM" />
        </CardContent>
      </Card>
    </div>
  )
}
