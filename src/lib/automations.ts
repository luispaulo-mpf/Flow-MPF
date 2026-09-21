import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { logActivity } from "@/lib/activity-log"

type Client = SupabaseClient<Database>

type TaskTemplate = { title: string; email: string }

const ENGENHARIA_TASKS: Record<"NECESSITA_PROJETO" | "NECESSITA_REVISAO", TaskTemplate[]> = {
  NECESSITA_PROJETO: [
    { title: "Desenvolvimento de Projeto", email: "engenharia@mpfhidraulicos.com.br" },
    { title: "Ficha Técnica", email: "engenharia@mpfhidraulicos.com.br" },
    { title: "Conferência e Aprovação", email: "compras@mpfhidraulicos.com.br" },
  ],
  NECESSITA_REVISAO: [
    { title: "Revisão do Projeto", email: "engenharia@mpfhidraulicos.com.br" },
    { title: "Revisão da Ficha Técnica", email: "engenharia@mpfhidraulicos.com.br" },
  ],
}

const PCP_TASKS: TaskTemplate[] = [
  { title: "Lançamento de Mão de Obra", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Lançamento Planilha de Pedidos", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Análise da Disponibilidade de Matéria Prima", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Solicitações de Compra de MP", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Geração de Ordens de Produção", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Separação de Desenhos para Produção", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Etiquetas Quadro Produção", email: "diogo.lopes@mpfhidraulicos.com.br" },
  { title: "Análise de Disponibilidade de Componentes", email: "almoxarifado@mpfhidraulicos.com.br" },
  { title: "Solicitação de Compras de Componentes", email: "almoxarifado@mpfhidraulicos.com.br" },
]

async function findUserByEmail(supabase: Client, companyId: string, email: string) {
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("company_id", companyId)
    .eq("email", email)
    .maybeSingle()
  return data?.id ?? null
}

async function createTaskIfMissing(
  supabase: Client,
  params: {
    companyId: string
    orderId: string
    orderItemId: string | null
    template: TaskTemplate
    createdByUserId: string
  },
) {
  const { companyId, orderId, orderItemId, template, createdByUserId } = params

  let existingQuery = supabase
    .from("tasks")
    .select("id")
    .eq("order_id", orderId)
    .eq("title", template.title)
  existingQuery = orderItemId
    ? existingQuery.eq("order_item_id", orderItemId)
    : existingQuery.is("order_item_id", null)

  const { data: existing } = await existingQuery.maybeSingle()
  if (existing) return

  const responsibleUserId = await findUserByEmail(supabase, companyId, template.email)
  const description = responsibleUserId
    ? null
    : `Responsável sugerido: ${template.email} (usuário ainda não cadastrado no Flow — crie-o em Configurações para atribuir automaticamente).`

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      company_id: companyId,
      order_id: orderId,
      order_item_id: orderItemId,
      title: template.title,
      description,
      responsible_user_id: responsibleUserId,
      created_by: createdByUserId,
    })
    .select("id")
    .single()

  if (error || !task) return

  await logActivity(supabase, {
    companyId,
    userId: createdByUserId,
    orderId,
    taskId: task.id,
    action: "Tarefa criada",
    description: `Tarefa "${template.title}" criada automaticamente.`,
  })
}

export async function runEngenhariaAutomation(
  supabase: Client,
  params: {
    companyId: string
    orderId: string
    orderErpNumber: string
    itemId: string
    itemCode: string | null
    itemDescription: string
    review: "REVISADO" | "NECESSITA_PROJETO" | "NECESSITA_REVISAO"
    createdByUserId: string
  },
) {
  if (params.review === "REVISADO") return

  const itemLabel = params.itemCode ? `Item ${params.itemCode}` : params.itemDescription
  const templates = ENGENHARIA_TASKS[params.review]
  for (const template of templates) {
    await createTaskIfMissing(supabase, {
      companyId: params.companyId,
      orderId: params.orderId,
      orderItemId: params.itemId,
      template: { title: `${template.title} — ${itemLabel}`, email: template.email },
      createdByUserId: params.createdByUserId,
    })
  }
}

export async function runPcpAutomation(
  supabase: Client,
  params: {
    companyId: string
    orderId: string
    newStatusId: string
    previousStatusId: string | null
    createdByUserId: string
  },
) {
  const { data: newStatus } = await supabase
    .from("statuses")
    .select("stage_key")
    .eq("id", params.newStatusId)
    .single()

  if (newStatus?.stage_key !== "PCP") return

  if (params.previousStatusId) {
    const { data: previousStatus } = await supabase
      .from("statuses")
      .select("stage_key")
      .eq("id", params.previousStatusId)
      .maybeSingle()
    if (previousStatus?.stage_key === "PCP") return
  }

  for (const template of PCP_TASKS) {
    await createTaskIfMissing(supabase, {
      companyId: params.companyId,
      orderId: params.orderId,
      orderItemId: null,
      template,
      createdByUserId: params.createdByUserId,
    })
  }
}
