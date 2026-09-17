"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export type LoginState = { error: string | null }

export async function signIn(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard")

  if (!email || !password) {
    return { error: "Informe e-mail e senha." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "E-mail ou senha inválidos." }
  }

  const { data: profile } = await supabase
    .from("users")
    .select("active")
    .eq("id", data.user.id)
    .single()

  if (!profile?.active) {
    await supabase.auth.signOut()
    return { error: "Usuário inativo. Contate um administrador." }
  }

  redirect(redirectTo.startsWith("/") ? redirectTo : "/dashboard")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
