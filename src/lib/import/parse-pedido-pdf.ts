import type { ImportOrderGroup } from "./types"

/**
 * Parser for the MPF ERP's "Listagem de Pedidos - Produtos por pedido" PDF
 * report. Unlike the "Produtos por data de entrega" report (see
 * parse-pdf.ts), this one is grouped Cliente -> Pedido -> item rows, and
 * each item row carries its OWN Emissão/Entrega date (a single pedido can
 * have items due on different dates). Columns:
 *   Emissão | Entrega | Produto | UN | Peso líquido | Peso bruto | OC |
 *   Qtde | Entregue | Saldo
 * The "OC" column is free text (often a multi-word note like "PEDIDO
 * FECHADO POR TELEFONE") that gets fragmented across several short lines by
 * the PDF's text extraction. We don't need OC at all, so rather than trying
 * to parse it we just skip past it and pull the trailing Qtde/Entregue/
 * Saldo integers off the end of whatever text sits between the weights and
 * the next row.
 */

const HEADER_PHRASE = "Emissão Entrega Produto UN Peso Líquido Peso Bruto OC Qtde Entregue Saldo"

const MARKER_RE = /Cliente: (.+?)(?= Pedido:| Cliente:|$)|Pedido: (\d+)/g

const ROW_RE =
  /(\d{2}\/\d{2}\/\d{2}) (\d{2}\/\d{2}\/\d{2}) (.+?) UN ([\d.,]+) ([\d.,]+) (.+?)(?=(?:\d{2}\/\d{2}\/\d{2} \d{2}\/\d{2}\/\d{2})|$)/g

function parseErpDate(value: string): string | null {
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const [, d, mo, yRaw] = m
  const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
}

export function isPedidoPorItemReportText(text: string): boolean {
  // The "Período / Tipo consulta" header line gets its cells interleaved by
  // the PDF's text extraction (labels first, then values out of order), so
  // check the two fragments separately rather than as one contiguous phrase.
  return (
    text.includes("LISTAGEM DE PEDIDOS") &&
    text.includes("Tipo consulta") &&
    text.includes("Produtos por pedido")
  )
}

export function parsePedidoPorItemReport(rawText: string): {
  orders: ImportOrderGroup[]
  rowErrors: string[]
} {
  let text = rawText.replace(/-- \d+ of \d+ --/g, " ")

  const totalIdx = text.indexOf("TOTAL GERAL")
  if (totalIdx !== -1) text = text.slice(0, totalIdx)

  const firstCliente = text.indexOf("Cliente:")
  if (firstCliente !== -1) text = text.slice(firstCliente)

  // Drop standalone subtotal lines (all-numeric, several tokens) before we
  // collapse newlines, so they never get swallowed into a row's "rest".
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

  const rowErrors: string[] = []

  text = text.replace(/\s+/g, " ").trim()
  text = text.split(HEADER_PHRASE).join(" ")

  const markers: { type: "cliente" | "pedido"; value: string; start: number; end: number }[] = []
  for (const m of text.matchAll(MARKER_RE)) {
    if (m[1] !== undefined) {
      markers.push({ type: "cliente", value: m[1].trim(), start: m.index, end: m.index + m[0].length })
    } else if (m[2] !== undefined) {
      markers.push({ type: "pedido", value: m[2], start: m.index, end: m.index + m[0].length })
    }
  }

  const orderMap = new Map<
    string,
    {
      erpOrderNumber: string
      customerName: string
      issueDate: string | null
      deliveryDate: string | null
      items: { itemCode: string | null; description: string; quantity: number; unit: string; deliveryDate: string | null }[]
    }
  >()

  let currentCliente = ""
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i]
    if (marker.type === "cliente") {
      currentCliente = marker.value
      continue
    }

    const pedidoNum = marker.value
    const blockEnd = markers[i + 1]?.start ?? text.length
    const block = text.slice(marker.end, blockEnd)

    for (const m of block.matchAll(/(\d{2}\/\d{2}\/\d{2}) \d{2}\/\d{2}\/\d{2} undefined - undefined/g)) {
      rowErrors.push(
        `Pedido ${pedidoNum}: item sem código/descrição no ERP em ${m[1]} (ignorado, dado incompleto na origem).`,
      )
    }

    ROW_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = ROW_RE.exec(block)) !== null) {
      const [, emissao, entrega, produto, , , rest] = match

      const [codigoRaw, ...descParts] = produto.trim().split(" - ")
      const codigo = codigoRaw.trim()
      const descricao = descParts.join(" - ").trim() || produto.trim()
      if (codigo.toLowerCase() === "undefined" || descricao.toLowerCase() === "undefined") continue

      const trailing = rest.trim().match(/(\d+)\s+(\d+)\s+(\d+)\s*$/)
      if (!trailing) continue
      const qtde = Number(trailing[1])

      const itemDeliveryDate = parseErpDate(entrega)

      if (!orderMap.has(pedidoNum)) {
        orderMap.set(pedidoNum, {
          erpOrderNumber: pedidoNum,
          customerName: currentCliente,
          issueDate: parseErpDate(emissao),
          deliveryDate: itemDeliveryDate,
          items: [],
        })
      }

      const order = orderMap.get(pedidoNum)!
      if (itemDeliveryDate && (!order.deliveryDate || itemDeliveryDate > order.deliveryDate)) {
        order.deliveryDate = itemDeliveryDate
      }
      order.items.push({
        itemCode: codigo,
        description: descricao,
        quantity: Number.isFinite(qtde) ? qtde : 0,
        unit: "UN",
        deliveryDate: itemDeliveryDate,
      })
    }
  }

  const orders: ImportOrderGroup[] = Array.from(orderMap.values()).map((o) => ({
    erpOrderNumber: o.erpOrderNumber,
    customerName: o.customerName,
    issueDate: o.issueDate,
    deliveryDate: o.deliveryDate,
    totalValue: null,
    items: o.items,
    kind: "NOVO",
    errors: o.items.length === 0 ? ["Nenhum item válido encontrado para este pedido."] : [],
  }))

  return { orders, rowErrors }
}
