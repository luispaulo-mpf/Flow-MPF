"use client"

import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { createClient } from "@/lib/supabase/client"
import { recordAttachment, deleteAttachment } from "@/actions/attachments"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Paperclip, Trash2, Upload } from "lucide-react"

type Attachment = {
  id: string
  file_name: string
  storage_path: string
  content_type: string | null
  size_bytes: number | null
  created_at: string
  users: { name: string } | null
  url: string | null
}

function formatSize(bytes: number | null) {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeFileName(name: string) {
  return name.replace(/[^\w.\-]+/g, "_")
}

const MAX_SIZE = 20 * 1024 * 1024 // 20MB

export function OrderAttachments({
  orderId,
  companyId,
  attachments,
  canEdit,
}: {
  orderId: string
  companyId: string
  attachments: Attachment[]
  canEdit: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    if (file.size > MAX_SIZE) {
      toast.error("Arquivo maior que 20MB.")
      return
    }

    setUploading(true)
    try {
      const supabase = createClient()
      const path = `${companyId}/${orderId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`

      const { error: uploadError } = await supabase.storage
        .from("order-attachments")
        .upload(path, file, { contentType: file.type || undefined })

      if (uploadError) throw uploadError

      await recordAttachment({
        orderId,
        fileName: file.name,
        storagePath: path,
        contentType: file.type || null,
        sizeBytes: file.size,
      })

      toast.success("Arquivo anexado.")
    } catch {
      toast.error("Não foi possível enviar o arquivo.")
    } finally {
      setUploading(false)
    }
  }

  function removeAttachment(attachmentId: string) {
    startTransition(async () => {
      try {
        await deleteAttachment(orderId, attachmentId)
        toast.success("Anexo removido.")
      } catch {
        toast.error("Não foi possível remover o anexo.")
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Anexos</CardTitle>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={handleFileChange}
              disabled={uploading}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="size-4" />
              {uploading ? "Enviando..." : "Enviar arquivo"}
            </Button>
          </>
        ) : null}
      </CardHeader>
      <CardContent>
        {attachments.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100">
            {attachments.map((att) => (
              <li key={att.id} className="flex items-center gap-2 py-2">
                <Paperclip className="size-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  {att.url ? (
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm text-primary hover:underline"
                    >
                      {att.file_name}
                    </a>
                  ) : (
                    <span className="block truncate text-sm text-slate-700">{att.file_name}</span>
                  )}
                  <p className="text-xs text-slate-400">
                    {att.users?.name ?? "—"}
                    {att.size_bytes ? ` · ${formatSize(att.size_bytes)}` : ""}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label="Remover anexo"
                    onClick={() => removeAttachment(att.id)}
                  >
                    <Trash2 className="size-4 text-slate-400" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
