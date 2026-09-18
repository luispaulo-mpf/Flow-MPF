"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth"

export type ActionResult = { error: string | null }

export async function updateCompanySettings(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const user = await requireUser()
  if (user.role !== "ADMIN") return { error: "Apenas administradores podem alterar essas opções." }

  const capacity = Number(formData.get("production_capacity_monthly"))
  const riskWindowDays = Number(formData.get("risk_window_days"))

  if (!Number.isFinite(capacity) || capacity <= 0) {
    return { error: "Informe uma capacidade mensal válida." }
  }
  if (!Number.isFinite(riskWindowDays) || riskWindowDays < 0) {
    return { error: "Informe um número de dias válido." }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from("companies")
    .update({
      production_capacity_monthly: Math.round(capacity),
      risk_window_days: Math.round(riskWindowDays),
    })
    .eq("id", user.companyId)

  if (error) return { error: "Não foi possível salvar as configurações." }

  revalidatePath("/configuracoes")
  revalidatePath("/dashboard")
  return { error: null }
}
