"use client"

import { useActionState, useEffect, useRef } from "react"
import { createStatus, type ActionResult } from "@/actions/statuses"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"

const initialState: ActionResult = { error: null }

export function NewStatusForm({
  nextPosition,
  scope,
}: {
  nextPosition: number
  scope: "ORDER" | "ITEM"
}) {
  const [state, formAction, pending] = useActionState(createStatus, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset()
  }, [pending, state.error])

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 items-end gap-2 border-t border-slate-200 pt-4 sm:grid-cols-[auto_1fr_auto_auto_auto]"
    >
      <input type="hidden" name="scope" value={scope} />
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Cor</Label>
        <input type="color" name="color" defaultValue="#64748b" className="h-9 w-9 rounded border" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Nome do novo status</Label>
        <Input
          name="name"
          required
          placeholder={scope === "ORDER" ? "Ex.: Em separação" : "Ex.: Em corte"}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Posição</Label>
        <Input name="position" type="number" defaultValue={nextPosition} className="w-20" />
      </div>
      {scope === "ORDER" ? (
        <label className="flex items-center gap-1.5 pb-2 text-sm text-slate-600">
          <Checkbox name="is_final" />
          Final
        </label>
      ) : (
        <span />
      )}
      <Button type="submit" size="sm" disabled={pending}>
        <Plus className="size-4" />
        {pending ? "Adicionando..." : "Adicionar"}
      </Button>
      {state.error ? <p className="col-span-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  )
}
