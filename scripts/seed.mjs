// Development seed: creates fictitious users, orders, tasks, comments and
// activity for the MPF Hidráulicos company using the service-role key.
// Usage: node scripts/seed.mjs
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  const text = readFileSync(new URL("../.env.local", import.meta.url), "utf-8")
  const env = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx === -1) continue
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1)
  }
  return env
}

const env = loadEnv()
const SEED_PASSWORD = "MpfFlow#2026"
const COMPANY_ID = "11111111-1111-1111-1111-111111111111"

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  { name: "Luis Paulo", email: "luispaulo@mpfhidraulicos.com.br", role: "ADMIN" },
  { name: "Ana Ferreira", email: "ana.ferreira@mpfhidraulicos.com.br", role: "GESTOR" },
  { name: "Carlos Souza", email: "carlos.souza@mpfhidraulicos.com.br", role: "RESPONSAVEL" },
  { name: "Marina Lima", email: "marina.lima@mpfhidraulicos.com.br", role: "RESPONSAVEL" },
  { name: "Roberto Alves", email: "roberto.alves@mpfhidraulicos.com.br", role: "VISUALIZACAO" },
]

const CUSTOMERS = [
  "Metalúrgica Vitória Ltda",
  "Indústria Ferrovia S.A.",
  "Hidráulica Norte Peças",
  "Usinagem Central Ltda",
  "Construtora Alicerce",
  "Transportes Rocha",
  "Mineradora Serra Azul",
  "Agroindustrial Bom Campo",
  "Equipamentos Pesados Brasil",
  "Siderúrgica Vale do Aço",
]

const ITEM_TEMPLATES = [
  ["Cilindro hidráulico 80mm", "UN"],
  ["Mangueira hidráulica 1/2\"", "MT"],
  ["Bomba hidráulica de engrenagem", "UN"],
  ["Válvula direcional 4/3", "UN"],
  ["Conexão NPT 3/4\"", "UN"],
  ["Óleo hidráulico ISO 68", "LT"],
  ["Retentor de haste 40x52", "UN"],
  ["Kit reparo cilindro", "KT"],
]

function toISODate(date) {
  return date.toISOString().slice(0, 10)
}

function daysFromNow(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function pick(arr, i) {
  return arr[i % arr.length]
}

async function ensureUser(spec) {
  const { data: existingProfile } = await supabase
    .from("users")
    .select("id")
    .eq("email", spec.email)
    .maybeSingle()

  if (existingProfile) {
    console.log(`user exists: ${spec.email}`)
    return existingProfile.id
  }

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: spec.email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { name: spec.name },
  })

  if (error || !created.user) {
    throw new Error(`failed to create auth user ${spec.email}: ${error?.message}`)
  }

  const { error: profileError } = await supabase.from("users").insert({
    id: created.user.id,
    company_id: COMPANY_ID,
    name: spec.name,
    email: spec.email,
    role: spec.role,
    active: true,
  })

  if (profileError) throw new Error(`failed to insert profile ${spec.email}: ${profileError.message}`)

  console.log(`created user: ${spec.email} (${spec.role})`)
  return created.user.id
}

async function main() {
  const userIds = {}
  for (const spec of USERS) {
    userIds[spec.email] = await ensureUser(spec)
  }

  const admin = userIds["luispaulo@mpfhidraulicos.com.br"]
  const gestor = userIds["ana.ferreira@mpfhidraulicos.com.br"]
  const responsavel1 = userIds["carlos.souza@mpfhidraulicos.com.br"]
  const responsavel2 = userIds["marina.lima@mpfhidraulicos.com.br"]
  const responsaveis = [responsavel1, responsavel2, gestor]

  const { data: statuses } = await supabase
    .from("statuses")
    .select("id, name, is_final")
    .eq("company_id", COMPANY_ID)
    .order("position")

  if (!statuses || statuses.length === 0) throw new Error("no statuses found; run migrations first")

  const { data: existingOrders } = await supabase
    .from("orders")
    .select("erp_order_number")
    .eq("company_id", COMPANY_ID)
  const existingNumbers = new Set((existingOrders ?? []).map((o) => o.erp_order_number))

  const priorities = ["LOW", "NORMAL", "NORMAL", "HIGH", "URGENT"]
  const createdOrderIds = []

  for (let i = 1; i <= 20; i++) {
    const erpOrderNumber = `PED-${String(1000 + i)}`
    if (existingNumbers.has(erpOrderNumber)) {
      const { data: existing } = await supabase
        .from("orders")
        .select("id")
        .eq("company_id", COMPANY_ID)
        .eq("erp_order_number", erpOrderNumber)
        .single()
      if (existing) createdOrderIds.push(existing.id)
      continue
    }

    const status = pick(statuses, i)
    const deliveryOffset = [-5, -2, 0, 1, 2, 5, 10, 20][i % 8]
    const responsible = pick(responsaveis, i)

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        company_id: COMPANY_ID,
        erp_order_number: erpOrderNumber,
        customer_name: pick(CUSTOMERS, i),
        issue_date: daysFromNow(-30 + i),
        delivery_date: daysFromNow(deliveryOffset),
        total_value: 1500 + i * 237.5,
        status_id: status.id,
        responsible_user_id: responsible,
        priority: pick(priorities, i),
        notes: i % 4 === 0 ? "Cliente solicitou prioridade na entrega." : null,
      })
      .select("id")
      .single()

    if (error || !order) {
      console.error(`failed to create order ${erpOrderNumber}:`, error?.message)
      continue
    }

    createdOrderIds.push(order.id)

    const itemCount = 1 + (i % 3)
    const items = Array.from({ length: itemCount }, (_, idx) => {
      const [description, unit] = pick(ITEM_TEMPLATES, i + idx)
      return {
        order_id: order.id,
        erp_item_code: `IT-${i}${idx}`,
        description,
        quantity: 1 + ((i + idx) % 10),
        unit,
        status: "PENDENTE",
      }
    })
    await supabase.from("order_items").insert(items)

    await supabase.from("activity_logs").insert({
      company_id: COMPANY_ID,
      user_id: gestor,
      order_id: order.id,
      action: "Pedido criado",
      description: `Pedido ${erpOrderNumber} criado via seed.`,
    })

    console.log(`created order: ${erpOrderNumber}`)
  }

  const taskTemplates = [
    { title: "Conferir estoque de matéria-prima", orderId: null },
    { title: "Cotar novo fornecedor de aço", orderId: null },
    { title: "Revisar processo de pintura", orderId: null },
    { title: "Separar itens para expedição", orderId: createdOrderIds[0] },
    { title: "Confirmar medidas com o cliente", orderId: createdOrderIds[1] },
    { title: "Agendar inspeção de qualidade", orderId: createdOrderIds[2] },
    { title: "Emitir nota fiscal", orderId: createdOrderIds[3] },
    { title: "Revisar prazo de entrega com cliente", orderId: createdOrderIds[4] },
  ]

  for (let i = 0; i < taskTemplates.length; i++) {
    const t = taskTemplates[i]
    const responsible = pick(responsaveis, i)
    const dueOffset = [-3, -1, 0, 1, 3, 7][i % 6]

    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("company_id", COMPANY_ID)
      .eq("title", t.title)
      .maybeSingle()
    if (existingTask) continue

    const { data: task } = await supabase
      .from("tasks")
      .insert({
        company_id: COMPANY_ID,
        order_id: t.orderId,
        title: t.title,
        description: null,
        responsible_user_id: responsible,
        created_by: gestor,
        status: i % 5 === 0 ? "DONE" : i % 3 === 0 ? "IN_PROGRESS" : "TODO",
        priority: pick(priorities, i),
        due_date: daysFromNow(dueOffset),
      })
      .select("id")
      .single()

    if (task) {
      await supabase.from("activity_logs").insert({
        company_id: COMPANY_ID,
        user_id: gestor,
        order_id: t.orderId,
        task_id: task.id,
        action: "Tarefa criada",
        description: `Tarefa "${t.title}" criada via seed.`,
      })
    }
  }

  if (createdOrderIds[0]) {
    await supabase.from("comments").insert([
      {
        company_id: COMPANY_ID,
        order_id: createdOrderIds[0],
        user_id: gestor,
        content: "Cliente confirmou recebimento do orçamento, aguardando aprovação.",
      },
      {
        company_id: COMPANY_ID,
        order_id: createdOrderIds[0],
        user_id: admin,
        content: "Priorizar esse pedido, cliente estratégico.",
      },
    ])
  }

  console.log("\nSeed concluído.")
  console.log(`Senha temporária para todos os usuários criados: ${SEED_PASSWORD}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
