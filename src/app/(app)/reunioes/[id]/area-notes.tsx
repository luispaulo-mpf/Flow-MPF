"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { NotebookPen } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { saveMeetingNotes } from "@/actions/meetings"
import { AREA_OPTIONS } from "./new-pendencia-dialog"

/** Free text per area for what isn't an action item. Saves when leaving the field. */
export function AreaNotes({
  meetingId,
  notes,
  canConduct,
}: {
  meetingId: string
  notes: Record<string, string>
  canConduct: boolean
}) {
  const [values, setValues] = useState<Record<string, string>>(notes)
  const [saved, setSaved] = useState<Record<string, string>>(notes)
  const [pending, startTransition] = useTransition()

  function save(area: string) {
    const text = values[area] ?? ""
    if (text === (saved[area] ?? "")) return
    startTransition(async () => {
      try {
        await saveMeetingNotes(meetingId, area, text)
        setSaved((s) => ({ ...s, [area]: text }))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível salvar a anotação.")
      }
    })
  }

  const visible = canConduct ? AREA_OPTIONS : AREA_OPTIONS.filter((a) => (notes[a.key] ?? "").trim())

  return (
    <Card>
      <CardHeader className="gap-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <NotebookPen className="size-4 text-primary" />
          Anotações por área
        </CardTitle>
        {canConduct ? (
          <p className="text-xs text-slate-500">
            Para o que não é pendência. Salva sozinho ao sair do campo{pending ? " · salvando..." : ""}.
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {visible.length === 0 ? <p className="text-sm text-slate-500">Nenhuma anotação.</p> : null}
        {visible.map((a) => (
          <div key={a.key} className="flex flex-col gap-1">
            <p className="text-xs font-medium text-slate-500">{a.label}</p>
            {canConduct ? (
              <Textarea
                rows={3}
                value={values[a.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [a.key]: e.target.value }))}
                onBlur={() => save(a.key)}
                placeholder="Escreva aqui..."
              />
            ) : (
              <p className="whitespace-pre-wrap rounded-md border border-slate-200 p-2 text-sm text-slate-700">
                {notes[a.key]}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
