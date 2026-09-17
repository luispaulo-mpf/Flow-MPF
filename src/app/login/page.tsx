import Image from "next/image"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "./login-form"

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; erro?: string }>
}) {
  const params = await searchParams
  const redirectTo = params.redirect ?? "/dashboard"

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/brand/mpf-logo-color.svg"
            alt="MPF Hidráulicos"
            width={132}
            height={74}
            className="h-12 w-auto"
            priority
          />
          <p className="mt-2 text-sm text-slate-500">MPF Flow · Camada de execução operacional</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse com suas credenciais da MPF Hidráulicos.</CardDescription>
          </CardHeader>
          <CardContent>
            {params.erro === "inativo" ? (
              <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Seu usuário está inativo. Contate um administrador.
              </p>
            ) : null}
            <LoginForm redirectTo={redirectTo} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
