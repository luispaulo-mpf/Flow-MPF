import { AlertTriangle, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { isOrderAtRisk, isOrderLate } from "@/lib/business-rules"

function formatDate(value: string | null) {
  if (!value) return "—"
  const [year, month, day] = value.split("-")
  return `${day}/${month}/${year}`
}

export function DeliveryDate({
  date,
  isFinalStatus,
}: {
  date: string | null
  isFinalStatus: boolean
}) {
  const late = isOrderLate(date, isFinalStatus)
  const atRisk = !late && isOrderAtRisk(date, isFinalStatus)

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm",
        late ? "font-medium text-red-600" : atRisk ? "font-medium text-amber-600" : "text-slate-600",
      )}
    >
      {late ? <AlertTriangle className="size-3.5" /> : atRisk ? <Clock className="size-3.5" /> : null}
      {formatDate(date)}
    </span>
  )
}
