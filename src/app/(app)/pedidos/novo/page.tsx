import { redirect } from "next/navigation"
import { requireUser, canManageOperations } from "@/lib/auth"
import { listStatuses } from "@/lib/queries"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NewOrderForm } from "./new-order-form"

export default async function NovoPedidoPage() {
  const user = await requireUser()
  if (!canManageOperations(user.role)) redirect("/pedidos")

  const statuses = await listStatuses(user.companyId)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Novo pedido</h1>
        <p className="text-sm text-slate-500">
          Criação manual. Pedidos em volume devem ser trazidos pela importação do ERP.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do pedido</CardTitle>
          <CardDescription>Campos com * são obrigatórios.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewOrderForm statuses={statuses} />
        </CardContent>
      </Card>
    </div>
  )
}
