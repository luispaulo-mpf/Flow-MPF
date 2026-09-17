export const ROLES = ["ADMIN", "GESTOR", "RESPONSAVEL", "VISUALIZACAO"] as const
export type Role = (typeof ROLES)[number]

export const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const
export type Priority = (typeof PRIORITIES)[number]

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Baixa",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "A fazer",
  IN_PROGRESS: "Em andamento",
  BLOCKED: "Bloqueada",
  DONE: "Concluída",
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  RESPONSAVEL: "Responsável",
  VISUALIZACAO: "Visualização",
}
