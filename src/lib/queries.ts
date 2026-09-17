import { createClient } from "@/lib/supabase/server"

export async function listStatuses(companyId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("statuses")
    .select("id, name, position, color, is_final, active")
    .eq("company_id", companyId)
    .order("position", { ascending: true })

  if (error) throw error
  return data
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
