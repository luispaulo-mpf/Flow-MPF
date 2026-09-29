import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Card, CardContent } from "@/components/ui/card"
import { NewUserDialog } from "./new-user-dialog"
import { UserRow } from "./user-row"

export default async function UsuariosPage() {
  const currentUser = await requireUser()
  if (currentUser.role !== "ADMIN") redirect("/dashboard")

  const supabase = await createClient()
  const { data: users } = await supabase
    .from("users")
    .select("id, name, email, role, active")
    .eq("company_id", currentUser.companyId)
    .order("name", { ascending: true })

  // Last sign-in lives in auth.users (only reachable with the service role).
  // Sessions stay open for days, so it only says when the password was typed;
  // last access (session refresh, ~hourly while the app is open) and last
  // action (activity log) show real usage.
  const adminClient = createAdminClient()
  const [{ data: authData }, { data: lastAccess }, lastActions] = await Promise.all([
    adminClient.auth.admin.listUsers({ perPage: 1000 }),
    supabase.rpc("company_users_last_access"),
    Promise.all(
      (users ?? []).map(async (u) => {
        const { data } = await supabase
          .from("activity_logs")
          .select("created_at")
          .eq("company_id", currentUser.companyId)
          .eq("user_id", u.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        return [u.id, data?.created_at ?? null] as const
      }),
    ),
  ])
  const lastSignInById = new Map(
    (authData?.users ?? []).map((a) => [a.id, a.last_sign_in_at ?? null]),
  )
  const lastAccessById = new Map((lastAccess ?? []).map((r) => [r.user_id, r.last_access_at]))
  const lastActionById = new Map(lastActions)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Usuários</h1>
          <p className="text-sm text-slate-500">{users?.length ?? 0} usuários na empresa</p>
        </div>
        <NewUserDialog />
      </div>

      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-slate-100">
            {(users ?? []).map((u) => (
              <UserRow
                key={u.id}
                user={{
                  ...u,
                  lastSignInAt: lastSignInById.get(u.id) ?? null,
                  lastAccessAt: lastAccessById.get(u.id) ?? null,
                  lastActionAt: lastActionById.get(u.id) ?? null,
                }}
                currentUserId={currentUser.id}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
