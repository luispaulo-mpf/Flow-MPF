import { createClient } from "@/lib/supabase/server"

export async function listStatuses(companyId: string, scope: "ORDER" | "ITEM" = "ORDER") {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("statuses")
    .select("id, name, position, color, is_final, active, stage_key")
    .eq("company_id", companyId)
    .eq("scope", scope)
    .order("position", { ascending: true })

  if (error) throw error
  return data
}

export async function getDefaultStatusId(
  companyId: string,
  scope: "ORDER" | "ITEM",
): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("statuses")
    .select("id")
    .eq("company_id", companyId)
    .eq("scope", scope)
    .eq("active", true)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle()

  return data?.id ?? null
}

export async function listActiveUsers(companyId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("users")
    .select("id, name, email, role, active")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name", { ascending: true })

  if (error) throw error
  return data
}
