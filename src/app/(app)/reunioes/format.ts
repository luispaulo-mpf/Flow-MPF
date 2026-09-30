const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]

/** YYYY-MM-DD -> DD/MM (or DD/MM/YYYY with `full`). */
export function formatDay(iso: string | null | undefined, full = false) {
  if (!iso) return "—"
  const [year, month, day] = iso.slice(0, 10).split("-")
  return full ? `${day}/${month}/${year}` : `${day}/${month}`
}

export function weekdayLabel(index: number) {
  return WEEKDAYS[index] ?? ""
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}
