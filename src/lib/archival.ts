import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { logActivity } from "@/lib/activity-log"

type Client = SupabaseClient<Database>

/**
 * Archives orders that have sat in an is_final status for longer than the
 * company's configured window. Archiving never deletes anything — it just
 * sets orders.archived_at, which drops the order off the Kanban board and
 * the active pedidos list while keeping items/tasks/comments/attachments/
 * history fully intact and reachable from the "Arquivados" view.
 */
export async function archiveStaleCompletedOrders(
  supabase: Client,
): Promise<{ archivedCount: number }> {
  let archivedCount = 0

  const { data: companies } = await supabase.from("companies").select("id, completed_archive_days")

  for (const company of companies ?? []) {
    const { data: finalStatuses } = await supabase
      .from("statuses")
      .select("id")
      .eq("company_id", company.id)
      .eq("scope", "ORDER")
      .eq("is_final", true)

    const finalStatusIds = (finalStatuses ?? []).map((s) => s.id)
    if (finalStatusIds.length === 0) continue

    const { data: candidates } = await supabase
      .from("orders")
      .select("id, erp_order_number")
      .eq("company_id", company.id)
      .is("archived_at", null)
      .in("status_id", finalStatusIds)

    for (const order of candidates ?? []) {
      const { data: historyRows } = await supabase
        .from("order_status_history")
        .select("entered_at, status_id")
        .eq("order_id", order.id)
        .order("entered_at", { ascending: false })

      const lastFinalEntry = (historyRows ?? []).find((row) => finalStatusIds.includes(row.status_id))
      if (!lastFinalEntry) continue

      const daysInFinalStatus =
        (Date.now() - new Date(lastFinalEntry.entered_at).getTime()) / (1000 * 60 * 60 * 24)
      if (daysInFinalStatus < company.completed_archive_days) continue

      const { error } = await supabase
        .from("orders")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", order.id)
      if (error) continue

      await logActivity(supabase, {
        companyId: company.id,
        userId: null,
        orderId: order.id,
        action: "Pedido arquivado",
        description: `Pedido ${order.erp_order_number} arquivado automaticamente após ${company.completed_archive_days} dias concluído.`,
      })
      archivedCount++
    }
  }

  return { archivedCount }
}
