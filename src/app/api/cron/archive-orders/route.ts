import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { archiveStaleCompletedOrders } from "@/lib/archival"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createAdminClient()
  const result = await archiveStaleCompletedOrders(supabase)
  return NextResponse.json(result)
}
