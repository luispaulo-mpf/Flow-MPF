"use client"

import { useActionState } from "react"
import { updateStatus, type ActionResult } from "@/actions/statuses"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"

type Status = {
  id: string
  name: string
  position: number
  color: string
  is_final: boolean
  active: boolean
  stage_key: string | null
}

const initialState: ActionResult = { error: null }

function StatusRow({ status, scope }: { status: Status; scope: "ORDER" | "ITEM" }) {
  const [state, formAction, pending] = useActionState(updateStatus, initialState)

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 items-center gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[auto_1fr_auto_auto_auto_auto_auto]"
    >
      <input type="hidden" name="id" value={status.id} />
      <input type="color" name="color" defaultValue={status.color} className="h-9 w-9 rounded border" />
      <Input name="name" defaultValue={status.name} className="min-w-0" />
      <Input
        name="position"
        type="number"
        defaultValue={status.position}
        className="w-20"
        title="Posição"
      />
      {scope === "ORDER" ? (
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <Checkbox name="is_final" defaultChecked={status.is_final} />
          Final
        </label>
      ) : (
        <span />
      )}
      {scope === "ORDER" ? (
        <select
          name="stage_key"
          defaultValue={status.stage_key ?? ""}
          title="Papel da etapa (usado pelas automações de tarefas)"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Sem papel especial</option>
          <option value="ENGENHARIA">Engenharia</option>
          <option value="PCP">PCP</option>
        </select>
      ) : (
        <span />
      )}
      <label className="flex items-center gap-1.5 text-sm text-slate-600">
        <Checkbox name="active" defaultChecked={status.active} />
        Ativo
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      {state.error ? <p className="col-span-full text-sm text-destructive">{state.error}</p> : null}
    </form>
  )
}

export function StatusList({ statuses, scope }: { statuses: Status[]; scope: "ORDER" | "ITEM" }) {
  if (statuses.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum status cadastrado ainda.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {statuses.map((status) => (
        <StatusRow key={status.id} status={status} scope={scope} />
      ))}
    </div>
  )
}
