import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

type Client = SupabaseClient<Database>

export async function logActivity(
  supabase: Client,
  params: {
    companyId: string
    userId: string
    orderId?: string | null
    taskId?: string | null
    action: string
    description?: string | null
  },
) {
  await supabase.from("activity_logs").insert({
    company_id: params.companyId,
    user_id: params.userId,
    order_id: params.orderId ?? null,
    task_id: params.taskId ?? null,
    action: params.action,
    description: params.description ?? null,
  })
}
