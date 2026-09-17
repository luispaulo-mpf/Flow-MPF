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
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">MPF Flow</h1>
          <p className="mt-1 text-sm text-slate-500">Camada de execução operacional</p>
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
