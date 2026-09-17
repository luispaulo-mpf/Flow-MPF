import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
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
              <UserRow key={u.id} user={u} currentUserId={currentUser.id} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
