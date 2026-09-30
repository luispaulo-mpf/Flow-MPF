// Restore MPF Flow data from a backup made by scripts/backup.mjs.
//
// Upserts every row of the backup (by primary key), parents before children:
// rows changed or deleted after the backup come back as they were; rows
// created after the backup are left untouched. Dry run unless --confirm.
//
// Usage:
//   node scripts/restore.mjs <backupFolder>                  # dry run: shows what would be restored
//   node scripts/restore.mjs <backupFolder> --confirm        # restores all tables
//   node scripts/restore.mjs <backupFolder> --confirm --tables=order_items,tasks

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { TABLES } from "./backup.mjs"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const CONFLICT_KEYS = { meeting_task_reviews: "meeting_id,task_id" }
const CHUNK = 500

const args = process.argv.slice(2)
const folder = args.find((a) => !a.startsWith("--"))
const confirm = args.includes("--confirm")
const only = args.find((a) => a.startsWith("--tables="))?.slice("--tables=".length).split(",")

if (!folder || !fs.existsSync(path.join(folder, "manifest.json"))) {
  console.error("Informe a pasta de um backup (com manifest.json).")
  process.exit(1)
}

const env = {}
for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const tables = TABLES.filter((t) => !only || only.includes(t))
console.log(`${confirm ? "RESTAURANDO" : "SIMULAÇÃO (use --confirm para aplicar)"} a partir de ${folder}`)

for (const table of tables) {
  const file = path.join(folder, `${table}.json`)
  if (!fs.existsSync(file)) continue
  const rows = JSON.parse(fs.readFileSync(file, "utf8"))
  console.log(`  ${table}: ${rows.length} registros`)
  if (!confirm) continue
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: CONFLICT_KEYS[table] ?? "id" })
    if (error) {
      console.error(`  ERRO em ${table}: ${error.message}`)
      process.exit(1)
    }
  }
}
console.log(confirm ? "Restauração concluída." : "Nada foi alterado.")
