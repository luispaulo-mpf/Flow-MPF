"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Download, Lock, Plus, Trash2, User, UserPlus, X } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { addParticipant, closeMeeting, deleteTestMeeting, removeParticipant } from "@/actions/meetings"
import { formatDay } from "../format"

type Participant = { id: string; name: string; user_id: string | null }

export function MeetingHeader({
  meetingId,
  meetingDate,
  isOpen,
  isTest,
  canConduct,
  canDeleteTest,
  closedAt,
  closedByName,
  participants,
  users,
}: {
  meetingId: string
  meetingDate: string
  isOpen: boolean
  isTest: boolean
  canConduct: boolean
  canDeleteTest: boolean
  closedAt: string | null
  closedByName: string | null
  participants: Participant[]
  users: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [freeName, setFreeName] = useState("")
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const presentUserIds = new Set(participants.map((p) => p.user_id).filter(Boolean))
  const available = users.filter((u) => !presentUserIds.has(u.id))

  function run(action: () => Promise<void>, success?: string) {
    startTransition(async () => {
      try {
        await action()
        if (success) toast.success(success)
        router.refresh()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível concluir.")
      }
    })
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
              Alinhamento semanal · {formatDay(meetingDate, true)}
              {isTest ? (
                <span className="rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-700">
                  TESTE
                </span>
              ) : null}
            </h1>
            {isTest ? (
              <p className="text-xs text-violet-700">
                Reunião de teste: não entra no histórico nem nas reuniões reais. As pendências criadas aqui são
                tarefas de verdade (quem for responsável recebe aviso) e são apagadas ao excluir o teste.
              </p>
            ) : null}
            {isOpen ? (
              <p className="text-sm text-amber-600">Em andamento · a pauta abaixo é atualizada com os pedidos</p>
            ) : (
              <p className="flex items-center gap-1 text-sm text-slate-500">
                <Lock className="size-3.5" />
                Encerrada{closedByName ? ` por ${closedByName}` : ""}
                {closedAt
                  ? ` em ${new Date(closedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : ""}{" "}
                · registro como estava naquele dia
              </p>
            )}
          </div>
          <div className="flex gap-2 print:hidden">
            {canDeleteTest ? (
              <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600">
                    <Trash2 className="size-4" />
                    Excluir teste
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Excluir a reunião de teste?</DialogTitle>
                    <DialogDescription>
                      Apaga esta reunião e todas as pendências criadas nela. Pendências de reuniões reais
                      não são afetadas.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteTestMeeting(meetingId)
                          } catch (e) {
                            if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e
                            toast.error(e instanceof Error ? e.message : "Não foi possível excluir.")
                          }
                        })
                      }
                    >
                      {pending ? "Excluindo..." : "Excluir"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Download className="size-4" />
              Exportar PDF
            </Button>
            {canConduct ? (
              <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
                <DialogTrigger asChild>
                  <Button size="sm">Encerrar reunião</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Encerrar a reunião?</DialogTitle>
                    <DialogDescription>
                      A pauta, as anotações e o status das pendências ficam registrados como estão agora e
                      não podem mais ser alterados. As pendências continuam em &ldquo;Minhas tarefas&rdquo;
                      e voltam na próxima reunião até serem concluídas.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmClose(false)}>
                      Cancelar
                    </Button>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(async () => {
                          await closeMeeting(meetingId)
                          setConfirmClose(false)
                        }, "Reunião encerrada.")
                      }
                    >
                      {pending ? "Encerrando..." : "Encerrar"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-400">Participantes:</span>
          {participants.map((p) => (
            <span
              key={p.id}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm text-slate-700 ${
                p.user_id ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-300"
              }`}
              title={p.user_id ? undefined : "Nome livre (sem usuário no Flow)"}
            >
              <User className="size-3.5 text-slate-400" />
              {p.name}
              {canConduct ? (
                <button
                  type="button"
                  aria-label={`Remover ${p.name}`}
                  className="text-slate-400 hover:text-red-600 print:hidden"
                  onClick={() => run(() => removeParticipant(meetingId, p.id))}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </span>
          ))}
          {participants.length === 0 ? <span className="text-sm text-slate-400">Ninguém ainda</span> : null}
          {canConduct && !adding ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-slate-500 print:hidden"
              onClick={() => setAdding(true)}
            >
              <UserPlus className="size-4" />
              Participante
            </Button>
          ) : null}
        </div>

        {canConduct && adding ? (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <select
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return
                run(() => addParticipant(meetingId, { userId: e.target.value }))
                e.target.value = ""
              }}
            >
              <option value="">Adicionar usuário do Flow...</option>
              {available.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-400">ou</span>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (!freeName.trim()) return
                run(async () => {
                  await addParticipant(meetingId, { name: freeName })
                  setFreeName("")
                })
              }}
            >
              <Input
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
                placeholder="Nome livre (ex.: Rafael)"
                className="w-48"
              />
              <Button type="submit" size="sm" variant="outline" disabled={pending}>
                <Plus className="size-4" />
                Adicionar
              </Button>
            </form>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Fechar
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
