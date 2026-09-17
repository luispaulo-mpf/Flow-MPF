import ExcelJS from "exceljs"
import Papa from "papaparse"

export type RawRow = Record<string, string>

const COLUMN_ALIASES: Record<string, string[]> = {
  pedido: ["codigo do pedido", "pedido", "numero do pedido", "numero pedido", "n do pedido"],
  cliente: ["cliente", "nome do cliente", "razao social"],
  dataEmissao: ["data emissao", "data de emissao", "emissao"],
  dataEntrega: ["data entrega", "data de entrega", "entrega", "prazo", "prazo de entrega"],
  valor: ["valor", "valor total", "total", "valor do pedido"],
  itemCodigo: ["codigo do item", "codigo item", "item", "codigo"],
  itemDescricao: ["descricao", "descricao do item", "produto"],
  quantidade: ["quantidade", "qtd", "qtde"],
  unidade: ["unidade", "un", "unid"],
}

export const REQUIRED_FIELDS = ["pedido", "cliente", "itemDescricao"] as const

function normalizeHeader(header: string): string {
  return header
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
}

export function mapHeaders(headers: string[]): {
  mapping: Record<string, number>
  missing: string[]
} {
  const normalized = headers.map(normalizeHeader)
  const mapping: Record<string, number> = {}

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h))
    if (idx !== -1) mapping[field] = idx
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in mapping))
  return { mapping, missing }
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") return value
  const str = String(value).trim()
  if (!str) return null
  const cleaned = str.replace(/[^\d,.-]/g, "")
  const hasComma = cleaned.includes(",")
  const hasDot = cleaned.includes(".")
  let normalized = cleaned
  if (hasComma && hasDot) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".")
  } else if (hasComma) {
    normalized = cleaned.replace(",", ".")
  }
  const num = Number(normalized)
  return Number.isFinite(num) ? num : null
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null
  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  }
  const str = String(value).trim()
  if (!str) return null

  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const brMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (brMatch) {
    const [, d, m, yRaw] = brMatch
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    return `${y}-${pad(Number(m))}-${pad(Number(d))}`
  }

  return null
}

export async function parseSpreadsheet(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<{ headers: string[]; rows: unknown[][] }> {
  const isCsv = fileName.toLowerCase().endsWith(".csv")

  if (isCsv) {
    const text = new TextDecoder("utf-8").decode(buffer)
    const result = Papa.parse<string[]>(text, { skipEmptyLines: true })
    const [headerRow, ...rows] = result.data
    return { headers: headerRow ?? [], rows }
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return { headers: [], rows: [] }

  const rows: unknown[][] = []
  let headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    const values = (row.values as unknown[]).slice(1).map((cell) => {
      if (cell && typeof cell === "object" && "text" in (cell as Record<string, unknown>)) {
        return (cell as { text: string }).text
      }
      if (cell && typeof cell === "object" && "result" in (cell as Record<string, unknown>)) {
        return (cell as { result: unknown }).result
      }
      return cell
    })
    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? ""))
    } else {
      rows.push(values)
    }
  })

  return { headers, rows }
}
