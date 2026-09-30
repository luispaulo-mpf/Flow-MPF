"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { createMeeting } from "@/actions/meetings"

function thisMonday() {
  const d = new Date()
  const weekday = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - weekday)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function NewMeetingButton() {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v && !date) setDate(thisMonday())
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Nova reunião
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova reunião de alinhamento</DialogTitle>
          <DialogDescription>
            A pauta é montada com os pedidos: atrasados, faturamento da semana e da seguinte, pontos de
            atenção e as pendências em aberto. Os participantes da última reunião já entram.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meeting-date">Data da reunião</Label>
          <Input
            id="meeting-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-48"
          />
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !date}
            onClick={() =>
              startTransition(async () => {
                try {
                  await createMeeting(date)
                } catch (e) {
                  // redirect() inside the action surfaces as a thrown NEXT_REDIRECT; let it through.
                  if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) throw e
                  toast.error(e instanceof Error ? e.message : "Não foi possível criar a reunião.")
                }
              })
            }
          >
            {pending ? "Criando..." : "Criar reunião"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
