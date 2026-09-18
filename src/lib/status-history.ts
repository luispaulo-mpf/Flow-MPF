import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

type Client = SupabaseClient<Database>

export async function recordOrderStatusHistory(
  supabase: Client,
  params: { companyId: string; orderId: string; statusId: string },
) {
  await supabase.from("order_status_history").insert({
    company_id: params.companyId,
    order_id: params.orderId,
    status_id: params.statusId,
  })
}

export async function recordOrderItemStatusHistory(
  supabase: Client,
  params: { companyId: string; orderItemId: string; statusId: string },
) {
  await supabase.from("order_item_status_history").insert({
    company_id: params.companyId,
    order_item_id: params.orderItemId,
    status_id: params.statusId,
  })
}
