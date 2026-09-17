/**
 * Central place for the deadline/risk rules from the spec (section 23), so
 * every screen (dashboard, kanban, order list, tasks) agrees on the same
 * definitions.
 */

function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function parseDateOnly(value: string | null): Date | null {
  if (!value) return null
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

export function isOrderLate(deliveryDate: string | null, isFinalStatus: boolean): boolean {
  if (isFinalStatus) return false
  const date = parseDateOnly(deliveryDate)
  if (!date) return false
  return date.getTime() < startOfToday().getTime()
}

export function isOrderAtRisk(deliveryDate: string | null, isFinalStatus: boolean): boolean {
  if (isFinalStatus) return false
  const date = parseDateOnly(deliveryDate)
  if (!date) return false
  const today = startOfToday()
  const limit = new Date(today)
  limit.setDate(limit.getDate() + 2)
  return date.getTime() <= limit.getTime()
}

export function isTaskLate(dueDate: string | null, status: string): boolean {
  if (status === "DONE") return false
  const date = parseDateOnly(dueDate)
  if (!date) return false
  return date.getTime() < startOfToday().getTime()
}

export function isTaskDueToday(dueDate: string | null, status: string): boolean {
  if (status === "DONE") return false
  const date = parseDateOnly(dueDate)
  if (!date) return false
  return date.getTime() === startOfToday().getTime()
}

/**
 * The statuses table has no dedicated "blocked" flag (spec section 9 only
 * defines is_final), so a status counts as blocking progress when its name
 * signals a wait on an external dependency (e.g. "Aguardando Material").
 */
export function isBlockedStatusName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
  return normalized.includes("BLOQUE") || normalized.includes("AGUARDANDO")
}

function toISODate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function riskLimitISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 2)
  return toISODate(d)
}

export function alertReason(params: {
  deliveryDate: string | null
  isFinalStatus: boolean
  isBlockedStatus: boolean
}): string | null {
  const { deliveryDate, isFinalStatus, isBlockedStatus } = params
  if (isOrderLate(deliveryDate, isFinalStatus)) return "Entrega atrasada"
  if (isBlockedStatus) return "Pedido bloqueado"
  if (isOrderAtRisk(deliveryDate, isFinalStatus)) return "Entrega próxima"
  return null
}
