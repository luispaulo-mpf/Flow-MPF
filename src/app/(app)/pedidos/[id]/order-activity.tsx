import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTimeBR } from "@/lib/business-rules"

type LogEntry = {
  id: string
  action: string
  description: string | null
  created_at: string
  users: { name: string } | null
}

function formatDateTime(value: string) {
  return formatDateTimeBR(value)
}

export function OrderActivity({ logs }: { logs: LogEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Histórico</CardTitle>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">Sem atividades registradas.</p>
        ) : (
          <ol className="flex flex-col gap-3 border-l border-slate-200 pl-4">
            {logs.map((log) => (
              <li key={log.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                <p className="font-medium text-slate-800">{log.action}</p>
                {log.description ? (
                  <p className="text-slate-500">{log.description}</p>
                ) : null}
                <p className="text-xs text-slate-400">
                  {log.users?.name ?? "Sistema"} · {formatDateTime(log.created_at)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
