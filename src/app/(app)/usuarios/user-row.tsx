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
  lastSignInAt: string | null
  lastAccessAt: string | null
  lastActionAt: string | null
}

// Fixed time zone so the server render (UTC on Vercel) and the browser agree.
function formatDateTime(value: string | null) {
  if (!value) return "—"
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
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
      <div className="min-w-40 flex-1">
        <p className="truncate text-sm font-medium text-slate-800">
          {user.name} {isSelf ? <span className="text-xs text-slate-400">(você)</span> : null}
        </p>
        <p className="truncate text-xs text-slate-500">{user.email}</p>
      </div>
      <dl className="flex gap-4 text-xs">
        <div className="w-28">
          <dt className="text-slate-400" title="Última vez que digitou e-mail e senha">
            Último login
          </dt>
          <dd className="text-slate-700">{formatDateTime(user.lastSignInAt)}</dd>
        </div>
        <div className="w-28">
          <dt
            className="text-slate-400"
            title="Última vez que abriu o sistema (aproximado, atualiza a cada ~1h de uso)"
          >
            Último acesso
          </dt>
          <dd className="font-medium text-slate-900">{formatDateTime(user.lastAccessAt)}</dd>
        </div>
        <div className="w-28">
          <dt className="text-slate-400">Última ação</dt>
          <dd className="text-slate-700">
            {user.lastActionAt ? formatDateTime(user.lastActionAt) : "Nenhuma"}
          </dd>
        </div>
      </dl>
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
