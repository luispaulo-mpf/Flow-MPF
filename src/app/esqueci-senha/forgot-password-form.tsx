"use client"

import { useState } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })

    setPending(false)
    if (error) {
      setError("Não foi possível enviar o e-mail. Tente novamente.")
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-3 text-sm text-slate-600">
        <p>
          Se existir uma conta com o e-mail <strong>{email}</strong>, você receberá um link para
          definir sua senha em instantes.
        </p>
        <Link href="/login" className="text-primary hover:underline">
          Voltar para o login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="voce@empresa.com.br"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Enviando..." : "Enviar link"}
      </Button>
      <Link href="/login" className="text-center text-sm text-slate-500 hover:underline">
        Voltar para o login
      </Link>
    </form>
  )
}
