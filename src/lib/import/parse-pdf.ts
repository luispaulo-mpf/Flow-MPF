import { PDFParse } from "pdf-parse"
import { parseNumber } from "./parse"
import type { ImportOrderGroup } from "./types"

/**
 * Parser for the MPF ERP's "Listagem de Pedidos - Produtos por data de
 * entrega" PDF report. This is a scraped print layout, not structured data,
 * so it is inherently tied to that report's column order:
 *   Número | Emissão | Produto | UN | Peso líquido | Peso bruto | Qtde |
 *   Entregue | Saldo | Unitário | Valor Pendente | Valor Total | Cliente
 * grouped under "Data entrega: DD/MM/YY" section headers.
 */

const HEADER_PHRASE =
  "Número Emissão Produto UN Peso líquido Peso bruto Qtde Entregue Saldo Unitário Valor Pendente Valor Total Cliente"

const ROW_RE =
  /(\d{3,6}) (\d{2}\/\d{2}\/\d{2}) (.+?) (?:([A-ZÇÃÕ]{1,4}) )?([\d.,]+) ([\d.,]+) (\d+) (\d+) (\d+) ([\d.,]+) ([\d.,]+) ([\d.,]+) (.+?)(?=(?:\d{3,6} \d{2}\/\d{2}\/\d{2})|$)/g

function parseErpDate(value: string): string | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const [, d, mo, yRaw] = m
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function isPedidosReportText(text: string): boolean {
  return text.includes("LISTAGEM DE PEDIDOS") && text.includes("Data entrega:")
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: Buffer.from(buffer) })
  const result = await parser.getText()
  return result.text
}

export function parsePedidosReport(rawText: string): {
  orders: ImportOrderGroup[]
  rowErrors: string[]
} {
  let text = rawText.replace(/-- \d+ of \d+ --/g, " ")

  const totalIdx = text.indexOf("TOTAL GERAL")
  if (totalIdx !== -1) text = text.slice(0, totalIdx)

  const firstSection = text.indexOf("Data entrega:")
  if (firstSection !== -1) text = text.slice(firstSection)

  // Drop standalone subtotal lines (all-numeric, several tokens) so they
  // don't get swallowed into the previous row's client-name capture.
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim()
      if (!t) return true
      const tokens = t.split(/\s+/)
      const numericTokens = tokens.filter((tok) => /^[\d.,]+$/.test(tok))
      return !(numericTokens.length === tokens.length && tokens.length >= 5)
    })
    .join("\n")

  text = text.replace(/\s+/g, " ").trim()
  text = text.split(HEADER_PHRASE).join(" ")

  const sections = text.split(/Data entrega: (\d{2}\/\d{2}\/\d{2})/).slice(1)

  const orderMap = new Map<
    string,
    {
      erpOrderNumber: string
      customerName: string
      issueDate: string | null
      deliveryDate: string | null
      totalValue: number
      items: { itemCode: string | null; description: string; quantity: number; unit: string }[]
    }
  >()
  const rowErrors: string[] = []

  for (let i = 0; i < sections.length; i += 2) {
    const deliveryDate = parseErpDate(sections[i])
    const body = sections[i + 1] ?? ""

    let match: RegExpExecArray | null
    ROW_RE.lastIndex = 0
    while ((match = ROW_RE.exec(body)) !== null) {
      const [
        ,
        numero,
        emissao,
        produto,
        unidade,
        ,
        ,
        qtde,
        ,
        ,
        ,
        ,
        valorTotal,
        cliente,
      ] = match

      const [codigoRaw, ...descParts] = produto.trim().split(" - ")
      const codigo = codigoRaw.trim()
      const descricao = descParts.join(" - ").trim() || produto.trim()

      if (codigo.toLowerCase() === "undefined" || descricao.toLowerCase() === "undefined") {
        rowErrors.push(
          `Pedido ${numero}: item sem código/descrição no ERP (ignorado, dado incompleto na origem).`,
        )
        continue
      }

      if (!orderMap.has(numero)) {
        orderMap.set(numero, {
          erpOrderNumber: numero,
          customerName: cliente.trim(),
          issueDate: parseErpDate(emissao),
          deliveryDate,
          totalValue: 0,
          items: [],
        })
      }

      const order = orderMap.get(numero)!
      if (deliveryDate && (!order.deliveryDate || deliveryDate > order.deliveryDate)) {
        order.deliveryDate = deliveryDate
      }
      order.totalValue += parseNumber(valorTotal) ?? 0
      order.items.push({
        itemCode: codigo,
        description: descricao,
        quantity: parseNumber(qtde) ?? 0,
        unit: unidade || "UN",
      })
    }
  }

  const orders: ImportOrderGroup[] = Array.from(orderMap.values()).map((o) => ({
    erpOrderNumber: o.erpOrderNumber,
    customerName: o.customerName,
    issueDate: o.issueDate,
    deliveryDate: o.deliveryDate,
    totalValue: o.totalValue || null,
    items: o.items,
    kind: "NOVO",
    errors: o.items.length === 0 ? ["Nenhum item válido encontrado para este pedido."] : [],
  }))

  return { orders, rowErrors }
}
