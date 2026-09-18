"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { previewImport, confirmImport, type PreviewState, type ConfirmState } from "@/actions/import"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react"

const previewInitial: PreviewState = { preview: null, error: null }
const confirmInitial: ConfirmState = { success: false, error: null, summary: null }

export function ImportWizard() {
  const [resetKey, setResetKey] = useState(0)
  return <ImportWizardInner key={resetKey} onReset={() => setResetKey((k) => k + 1)} />
}

function ImportWizardInner({ onReset }: { onReset: () => void }) {
  const router = useRouter()
  const [previewState, previewAction, previewPending] = useActionState(
    previewImport,
    previewInitial,
  )
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmImport,
    confirmInitial,
  )
  const [fileName, setFileName] = useState<string | null>(null)

  const preview = previewState.preview
  const validOrders = preview?.orders.filter((o) => o.errors.length === 0) ?? []
  const novos = validOrders.filter((o) => o.kind === "NOVO")
  const atualizados = validOrders.filter((o) => o.kind === "ATUALIZADO")

  if (confirmState.success) {
    return (
      <Alert className="border-green-200 bg-green-50">
        <CheckCircle2 className="size-4 text-green-600" />
        <AlertTitle>Importação concluída</AlertTitle>
        <AlertDescription>
          {confirmState.summary}
          <div className="mt-3">
            <Button size="sm" onClick={() => router.push("/pedidos")}>
              Ver pedidos
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  if (!preview) {
    return (
      <form action={previewAction} className="flex flex-col gap-4">
        <label
          htmlFor="file"
          className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center hover:border-primary/50"
        >
          <FileSpreadsheet className="size-8 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {fileName ?? "Clique para selecionar um arquivo XLSX, CSV ou PDF"}
          </span>
          <span className="text-xs text-slate-400">ou arraste o arquivo até aqui</span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          required
        />
        {previewState.error ? (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" />
            <AlertTitle>Não foi possível processar o arquivo</AlertTitle>
            <AlertDescription>{previewState.error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" disabled={previewPending || !fileName}>
            {previewPending ? "Processando..." : "Analisar arquivo"}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="border-green-200 bg-green-50 text-green-700" variant="outline">
          {novos.length} novos
        </Badge>
        <Badge className="border-blue-200 bg-blue-50 text-blue-700" variant="outline">
          {atualizados.length} atualizados
        </Badge>
        {preview.rowErrors.length > 0 ? (
          <Badge className="border-red-200 bg-red-50 text-red-700" variant="outline">
            {preview.rowErrors.length} erros
          </Badge>
        ) : null}
      </div>

      {preview.rowErrors.length > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Linhas com erro (ignoradas)</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {preview.rowErrors.slice(0, 10).map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
            {preview.rowErrors.length > 10 ? (
              <p className="mt-1">e mais {preview.rowErrors.length - 10}...</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="max-h-96 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Entrega</TableHead>
              <TableHead>Itens</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {validOrders.map((o) => (
              <TableRow key={o.erpOrderNumber}>
                <TableCell className="font-medium">{o.erpOrderNumber}</TableCell>
                <TableCell>{o.customerName}</TableCell>
                <TableCell>{o.deliveryDate ?? "—"}</TableCell>
                <TableCell>{o.items.length}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      o.kind === "NOVO"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-blue-200 bg-blue-50 text-blue-700"
                    }
                  >
                    {o.kind === "NOVO" ? "Novo" : "Atualizado"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <form action={confirmAction} className="flex items-center justify-between gap-3">
        <input
          type="hidden"
          name="payload"
          value={JSON.stringify({ reportType: preview.reportType, orders: validOrders })}
        />
        {confirmState.error ? (
          <p className="text-sm text-destructive">{confirmState.error}</p>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onReset}>
            Cancelar
          </Button>
          <Button type="submit" disabled={confirmPending || validOrders.length === 0}>
            {confirmPending ? "Importando..." : `Confirmar importação (${validOrders.length})`}
          </Button>
        </div>
      </form>
    </div>
  )
}
