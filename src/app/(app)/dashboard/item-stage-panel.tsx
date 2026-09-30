import Link from "next/link"
import { AlertTriangle, ChevronRight, Factory } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDuration } from "@/lib/history"
import { cn } from "@/lib/utils"

export type StageItem = {
  id: string
  orderId: string
  orderNumber: string
  customerName: string
  itemCode: string | null
  description: string
  quantity: number
  deliveryDate: string | null
  late: boolean
  inStageMs: number | null
}

export type ItemStage = {
  statusId: string
  name: string
  color: string
  items: StageItem[]
  pieces: number
  orderCount: number
  lateCount: number
  oldestMs: number | null
}

const DEFAULT_STATUS_COLOR = "#64748b"
// Distinct hues for shop-floor stages when the status keeps the default grey.
const STAGE_PALETTE = ["#2563eb", "#0891b2", "#ea580c", "#4f46e5", "#0d9488", "#db2777", "#65a30d"]

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
}

/**
 * A colour chosen in Configurações wins. Otherwise: waiting = amber,
 * third party = violet (same as the Kanban badge), finished = green, and the
 * production stages cycle through distinct hues.
 */
function stageColor(name: string, color: string, index: number) {
  if (color && color.toLowerCase() !== DEFAULT_STATUS_COLOR) return color
  const n = normalize(name)
  if (n.includes("AGUARDANDO") || n.includes("BLOQUE")) return "#f59e0b"
  if (n.includes("TERCEIRO")) return "#7c3aed"
  if (n.includes("FINALIZ") || n.includes("CONCLU")) return "#16a34a"
  return STAGE_PALETTE[index % STAGE_PALETTE.length]
}

function formatDate(value: string | null) {
  if (!value) return "—"
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year.slice(2)}`
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toLocaleString("pt-BR")
}

/**
 * Shop-floor view: how many items (and pieces) of in-progress orders sit in
 * each item stage right now — solda, usinagem, montagem... — with a
 * drill-down list per stage, longest-waiting first.
 */
export function ItemStagePanel({ stages: rawStages }: { stages: ItemStage[] }) {
  const stages = rawStages.map((s, i) => ({ ...s, color: stageColor(s.name, s.color, i) }))
  const totalItems = stages.reduce((sum, s) => sum + s.items.length, 0)
  const totalPieces = stages.reduce((sum, s) => sum + s.pieces, 0)
  const maxItems = Math.max(1, ...stages.map((s) => s.items.length))

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory className="size-4 text-primary" />
          Produção por etapa
        </CardTitle>
        <p className="text-xs text-slate-500">
          Itens ainda em produção nos pedidos em andamento, por etapa atual ·{" "}
          <span className="font-medium text-slate-700">{totalItems} itens</span> ·{" "}
          <span className="font-medium text-slate-700">{formatQty(totalPieces)} peças</span>. Clique
          numa etapa para ver os itens.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {totalItems > 0 ? (
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
            {stages
              .filter((s) => s.items.length > 0)
              .map((s) => (
                <div
                  key={s.statusId}
                  title={`${s.name}: ${s.items.length} itens`}
                  style={{ width: `${(s.items.length / totalItems) * 100}%`, backgroundColor: s.color }}
                />
              ))}
          </div>
        ) : null}

        <div className="hidden grid-cols-[minmax(11rem,2fr)_minmax(0,1.4fr)_56px_60px_76px_96px_16px] gap-3 px-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 md:grid">
          <span>Etapa</span>
          <span>Itens</span>
          <span className="text-right">Peças</span>
          <span className="text-right">Pedidos</span>
          <span className="text-right">Atrasados</span>
          <span className="text-right">Mais antigo</span>
          <span />
        </div>

        <div className="flex flex-col divide-y divide-slate-100 rounded-md border border-slate-200">
          {stages.map((stage) => {
            const empty = stage.items.length === 0
            const summary = (
              <div
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-2 py-2.5 md:grid-cols-[minmax(11rem,2fr)_minmax(0,1.4fr)_56px_60px_76px_96px_16px]",
                  empty && "opacity-50",
                )}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-800">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
                  <span className="truncate">{stage.name}</span>
                </span>
                <span className="flex items-center gap-2 md:order-none">
                  <span className="hidden h-2 flex-1 overflow-hidden rounded-full bg-slate-100 md:block">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(stage.items.length / maxItems) * 100}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-lg font-semibold text-slate-900">
                    {stage.items.length}
                  </span>
                </span>
                <span className="col-span-2 flex flex-wrap gap-x-3 text-xs text-slate-500 md:contents">
                  <span className="md:text-right md:text-sm md:text-slate-700">
                    <span className="md:hidden">Peças: </span>
                    {formatQty(stage.pieces)}
                  </span>
                  <span className="md:text-right md:text-sm md:text-slate-700">
                    <span className="md:hidden">Pedidos: </span>
                    {stage.orderCount}
                  </span>
                  <span
                    className={cn(
                      "md:text-right md:text-sm",
                      stage.lateCount > 0 ? "font-semibold text-red-600" : "md:text-slate-700",
                    )}
                  >
                    <span className="md:hidden">Atrasados: </span>
                    {stage.lateCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <AlertTriangle className="size-3.5" />
                        {stage.lateCount}
                      </span>
                    ) : (
                      0
                    )}
                  </span>
                  <span className="md:text-right md:text-sm md:text-slate-700">
                    <span className="md:hidden">Mais antigo: </span>
                    {formatDuration(stage.oldestMs)}
                  </span>
                </span>
                {empty ? (
                  <span className="hidden md:block" />
                ) : (
                  <ChevronRight className="hidden size-4 text-slate-400 transition-transform group-open:rotate-90 md:block" />
                )}
              </div>
            )

            if (empty) return <div key={stage.statusId}>{summary}</div>

            return (
              <details key={stage.statusId} className="group">
                <summary className="cursor-pointer list-none hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  {summary}
                </summary>
                <div className="overflow-x-auto border-t border-slate-100 bg-slate-50/60 px-2 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                        <th className="px-2 py-1 font-medium">Pedido</th>
                        <th className="px-2 py-1 font-medium">Item</th>
                        <th className="px-2 py-1 text-right font-medium">Qtd.</th>
                        <th className="px-2 py-1 font-medium">Prazo</th>
                        <th className="px-2 py-1 font-medium">Na etapa há</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stage.items.map((item) => (
                        <tr key={item.id} className="border-t border-slate-100 align-top">
                          <td className="px-2 py-1.5">
                            <Link
                              href={`/pedidos/${item.orderId}`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {item.orderNumber}
                            </Link>
                            <p className="max-w-40 truncate text-xs text-slate-500">{item.customerName}</p>
                          </td>
                          <td className="px-2 py-1.5 text-slate-700">
                            {item.itemCode ? (
                              <span className="mr-1 text-xs text-slate-400">{item.itemCode}</span>
                            ) : null}
                            {item.description}
                          </td>
                          <td className="px-2 py-1.5 text-right text-slate-700">{formatQty(item.quantity)}</td>
                          <td
                            className={cn(
                              "whitespace-nowrap px-2 py-1.5",
                              item.late ? "font-medium text-red-600" : "text-slate-600",
                            )}
                          >
                            {item.late ? <AlertTriangle className="mr-1 inline size-3.5" /> : null}
                            {formatDate(item.deliveryDate)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-slate-600">
                            {formatDuration(item.inStageMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
