// Daily backup of the MPF Flow database (and uploaded attachments).
//
// Exports every table to JSON under <BACKUP_DIR>/<YYYY-MM-DD_HHmm>/, plus
// the files in the "order-attachments" storage bucket, and keeps the newest
// KEEP backups. Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
// from .env.local (service role: bypasses RLS so nothing is left out).
// The schema lives in supabase/migrations; restore with scripts/restore.mjs.
//
// Usage: node scripts/backup.mjs [backupDir]

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const BACKUP_DIR = process.argv[2] ?? path.join(ROOT, "Flow", "Backup")
const KEEP = 30
const PAGE = 1000

// Parents before children, so a restore can insert in this order.
export const TABLES = [
  "companies",
  "users",
  "statuses",
  "orders",
  "order_items",
  "meetings",
  "tasks",
  "comments",
  "activity_logs",
  "order_attachments",
  "order_status_history",
  "order_item_status_history",
  "notifications",
  "meeting_participants",
  "meeting_order_notes",
  "meeting_task_reviews",
]

function loadEnv() {
  const env = {}
  const file = path.join(ROOT, ".env.local")
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return env
}

function stamp() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day}_${parts.hour}${parts.minute}`
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`
  console.log(line)
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  fs.appendFileSync(path.join(BACKUP_DIR, "backup.log"), line + "\n")
}

async function exportTable(supabase, table) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...data)
    if (data.length < PAGE) break
  }
  return rows
}

async function exportAttachments(supabase, rows, dir) {
  let count = 0
  for (const row of rows) {
    const { data, error } = await supabase.storage.from("order-attachments").download(row.storage_path)
    if (error || !data) {
      log(`  anexo não baixado: ${row.storage_path} (${error?.message ?? "sem dados"})`)
      continue
    }
    const target = path.join(dir, "attachments", row.storage_path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, Buffer.from(await data.arrayBuffer()))
    count += 1
  }
  return count
}

function prune() {
  const backups = fs
    .readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(d.name))
    .map((d) => d.name)
    .sort()
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true })
    log(`backup antigo removido: ${old}`)
  }
}

async function main() {
  const env = loadEnv()
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes no .env.local")
  }
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const name = stamp()
  const finalDir = path.join(BACKUP_DIR, name)
  const workDir = path.join(BACKUP_DIR, `.${name}.partial`)
  fs.rmSync(workDir, { recursive: true, force: true })
  fs.mkdirSync(workDir, { recursive: true })
  log(`backup iniciado: ${name}`)

  const manifest = { createdAt: new Date().toISOString(), tables: {}, attachments: 0 }
  for (const table of TABLES) {
    const rows = await exportTable(supabase, table)
    fs.writeFileSync(path.join(workDir, `${table}.json`), JSON.stringify(rows, null, 1))
    manifest.tables[table] = rows.length
    if (table === "order_attachments") manifest.attachments = await exportAttachments(supabase, rows, workDir)
  }
  fs.writeFileSync(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2))

  // Only a complete export becomes a visible backup.
  fs.rmSync(finalDir, { recursive: true, force: true })
  fs.renameSync(workDir, finalDir)
  const total = Object.values(manifest.tables).reduce((a, b) => a + b, 0)
  log(`backup concluído: ${name} (${total} registros, ${manifest.attachments} anexos)`)
  prune()
}

// Run only when executed directly (restore.mjs imports TABLES from here).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((e) => {
    log(`ERRO no backup: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  })
}
