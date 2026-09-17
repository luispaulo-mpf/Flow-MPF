"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { updateUserRole, updateUserActive } from "@/actions/users"
import { ROLE_LABELS, ROLES } from "@/types/domain"

type User = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

export function UserRow({ user, currentUserId }: { user: User; currentUserId: string }) {
  const [, startTransition] = useTransition()
  const isSelf = user.id === currentUserId

  function changeRole(role: string) {
    startTransition(async () => {
      try {
        await updateUserRole(user.id, role)
        toast.success("Papel atualizado.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar.")
      }
    })
  }

  function toggleActive(active: boolean) {
    startTransition(async () => {
      try {
        await updateUserActive(user.id, active)
        toast.success(active ? "Usuário ativado." : "Usuário desativado.")
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao atualizar.")
      }
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {user.name} {isSelf ? <span className="text-xs text-slate-400">(você)</span> : null}
        </p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <select
        defaultValue={user.role}
        disabled={isSelf}
        onChange={(e) => changeRole(e.target.value)}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-60"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <Switch
          checked={user.active}
          disabled={isSelf}
          onCheckedChange={toggleActive}
        />
        <span className="text-xs text-slate-500">{user.active ? "Ativo" : "Inativo"}</span>
      </div>
    </li>
  )
}
