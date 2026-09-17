"use client"

import { useActionState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { createComment, type ActionResult } from "@/actions/comments"

type Comment = {
  id: string
  content: string
  created_at: string
  users: { name: string } | null
}

const initialState: ActionResult = { error: null }

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function OrderComments({ orderId, comments }: { orderId: string; comments: Comment[] }) {
  const [state, formAction, pending] = useActionState(createComment, initialState)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && !state.error) formRef.current?.reset()
  }, [pending, state.error])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comentários</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <form ref={formRef} action={formAction} className="flex flex-col gap-2">
          <input type="hidden" name="order_id" value={orderId} />
          <Textarea name="content" placeholder="Escreva um comentário..." rows={2} required />
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Enviando..." : "Comentar"}
            </Button>
          </div>
        </form>

        {comments.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum comentário ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {comments.map((c) => (
              <li key={c.id} className="rounded-md bg-slate-50 p-3 text-sm">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium text-slate-700">{c.users?.name ?? "Usuário"}</span>
                  <span>{formatDateTime(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-slate-700">{c.content}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
