"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { unarchiveOrder } from "@/actions/orders"
import { Archive } from "lucide-react"

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR")
}

export function OrderArchivedBanner({
  orderId,
  archivedAt,
  canUnarchive,
}: {
  orderId: string
  archivedAt: string
  canUnarchive: boolean
}) {
  const [pending, startTransition] = useTransition()

  function handleUnarchive() {
    startTransition(async () => {
      try {
        await unarchiveOrder(orderId)
        toast.success("Pedido desarquivado.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível desarquivar o pedido.")
      }
    })
  }

  return (
    <Alert>
      <Archive className="size-4" />
      <AlertTitle>Pedido arquivado</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
        <span>
          Arquivado automaticamente em {formatDateTime(archivedAt)} — não aparece mais no Kanban
          nem na lista principal de pedidos, mas nada foi apagado.
        </span>
        {canUnarchive ? (
          <Button size="sm" variant="outline" onClick={handleUnarchive} disabled={pending}>
            {pending ? "Desarquivando..." : "Desarquivar"}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  )
}
