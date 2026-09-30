import Link from "next/link"
import { Hourglass } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { StageItem } from "./item-stage-panel"

/** A pedido or item sitting in the same stage this long counts as stalled. */
export const STALE_DAYS = 7

export type StaleOrder = {
  id: string
  orderNumber: string
  customerName: string
  stageName: string
  days: number
}
export type StaleItem = StageItem & { stageName: string; days: number }

const SHOW = 8

function DaysBadge({ days }: { days: number }) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium",
        days >= STALE_DAYS * 2
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      {days} dias
    </span>
  )
}

/**
 * Orders and items that haven't moved for STALE_DAYS or more: either they're
 * really stuck, or nobody updated the Flow. Both need someone to look.
 */
export function StalePanel({ orders, items, days }: { orders: StaleOrder[]; items: StaleItem[]; days: number }) {
  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="size-4 text-primary" />
          Sem movimentação há {days} dias ou mais
        </CardTitle>
        <p className="text-xs text-slate-500">
          Parado de verdade ou sem atualização no Flow: nos dois casos vale conferir. Vermelho = {days * 2} dias
          ou mais.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Pedidos na mesma coluna do Kanban <span className="font-normal text-slate-500">({orders.length})</span>
          </h3>
          {orders.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum pedido parado.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {orders.slice(0, SHOW).map((o) => (
                <li key={o.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <Link href={`/pedidos/${o.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium text-slate-900">{o.orderNumber}</span>{" "}
                    <span className="text-slate-500">· {o.customerName}</span>
                    <span className="block text-xs text-slate-400">em {o.stageName}</span>
                  </Link>
                  <DaysBadge days={o.days} />
                </li>
              ))}
            </ul>
          )}
          {orders.length > SHOW ? (
            <p className="text-xs text-slate-400">e mais {orders.length - SHOW} pedidos</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-800">
            Itens na mesma etapa <span className="font-normal text-slate-500">({items.length})</span>
          </h3>
          {items.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum item parado.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100">
              {items.slice(0, SHOW).map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-1.5 text-sm">
                  <Link href={`/pedidos/${i.orderId}`} className="min-w-0 flex-1 hover:underline">
                    <span className="font-medium text-slate-900">{i.orderNumber}</span>{" "}
                    <span className="text-slate-500">· {i.itemCode ? `${i.itemCode} · ` : ""}</span>
                    <span className="line-clamp-1 text-xs text-slate-600">{i.description}</span>
                    <span className="block text-xs text-slate-400">em {i.stageName}</span>
                  </Link>
                  <DaysBadge days={i.days} />
                </li>
              ))}
            </ul>
          )}
          {items.length > SHOW ? <p className="text-xs text-slate-400">e mais {items.length - SHOW} itens</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}
