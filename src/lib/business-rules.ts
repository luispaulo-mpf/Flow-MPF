/**
 * Central place for the deadline/risk rules from the spec (section 23), so
 * every screen (dashboard, kanban, order list, tasks) agrees on the same
 * definitions.
 */

/** The business runs on Brasília time; servers (Vercel) run on UTC. */
export const APP_TIME_ZONE = "America/Sao_Paulo"

const brDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** YYYY-MM-DD of an instant (default: now) in Brasília time. */
export function brDate(value: Date | string = new Date()): string {
  return brDateFormat.format(typeof value === "string" ? new Date(value) : value)
}

function startOfToday() {
  return parseDateOnly(brDate()) as Date
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

export function isOrderAtRisk(
  deliveryDate: string | null,
  isFinalStatus: boolean,
  riskWindowDays: number = 2,
): boolean {
  if (isFinalStatus) return false
  const date = parseDateOnly(deliveryDate)
  if (!date) return false
  const today = startOfToday()
  const limit = new Date(today)
  limit.setDate(limit.getDate() + riskWindowDays)
  return date.getTime() <= limit.getTime()
}

/**
 * order_items has no dedicated "finished" flag exposed in Configurações
 * (the "Final" checkbox is order-scope only), so — same convention as
 * isBlockedStatusName below — an item status counts as finished when its
 * name says so (e.g. "FINALIZADO").
 */
export function isItemFinishedStatusName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
  return normalized.includes("FINALIZ") || normalized.includes("CONCLU")
}

export function isItemLate(deliveryDate: string | null, isFinishedStatus: boolean): boolean {
  if (isFinishedStatus) return false
  const date = parseDateOnly(deliveryDate)
  if (!date) return false
  return date.getTime() < startOfToday().getTime()
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

/**
 * Same name-based convention: an item status counts as "with a third party"
 * (outsourced machining, plating etc.) when its name says so, e.g. "EM TERCEIROS".
 */
export function isThirdPartyStatusName(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
  return normalized.includes("TERCEIRO")
}

function toISODate(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return brDate()
}

export function riskLimitISO(): string {
  const d = startOfToday()
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
