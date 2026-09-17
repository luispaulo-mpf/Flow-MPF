import { redirect } from "next/navigation"
import { requireUser, canManageOperations } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ImportWizard } from "./import-wizard"

export default async function ImportarPage() {
  const user = await requireUser()
  if (!canManageOperations(user.role)) redirect("/dashboard")

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Importar do ERP</h1>
        <p className="text-sm text-slate-500">
          Envie um arquivo XLSX ou CSV exportado do ERP para criar ou atualizar pedidos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Colunas esperadas</CardTitle>
          <CardDescription>
            Código do pedido, Cliente, Data emissão, Data entrega, Valor, Código do item,
            Descrição, Quantidade, Unidade. A chave do pedido é empresa + número do pedido —
            pedidos existentes são atualizados, nunca duplicados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportWizard />
        </CardContent>
      </Card>
    </div>
  )
}
