"use client"

import { useActionState } from "react"
import { updateCompanySettings, type ActionResult } from "@/actions/company"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

const initialState: ActionResult = { error: null }

export function CompanySettingsForm({
  productionCapacityMonthly,
  riskWindowDays,
}: {
  productionCapacityMonthly: number
  riskWindowDays: number
}) {
  const [state, formAction, pending] = useActionState(updateCompanySettings, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Capacidade de produção (peças/mês)</Label>
        <Input
          name="production_capacity_monthly"
          type="number"
          min={1}
          defaultValue={productionCapacityMonthly}
          className="w-40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Dias para alerta de prazo próximo</Label>
        <Input
          name="risk_window_days"
          type="number"
          min={0}
          defaultValue={riskWindowDays}
          className="w-40"
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Salvando..." : "Salvar"}
      </Button>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  )
}
