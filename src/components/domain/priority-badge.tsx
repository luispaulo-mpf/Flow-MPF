import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { PRIORITY_LABELS, type Priority } from "@/types/domain"

const STYLES: Record<Priority, string> = {
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
  NORMAL: "bg-blue-50 text-blue-700 border-blue-200",
  HIGH: "bg-amber-50 text-amber-700 border-amber-200",
  URGENT: "bg-red-50 text-red-700 border-red-200",
}

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const p = priority as Priority
  return (
    <Badge variant="outline" className={cn(STYLES[p] ?? STYLES.NORMAL, className)}>
      {PRIORITY_LABELS[p] ?? priority}
    </Badge>
  )
}
