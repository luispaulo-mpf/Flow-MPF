export type ImportItemRow = {
  itemCode: string | null
  description: string
  quantity: number
  unit: string | null
  deliveryDate?: string | null
}

export type ImportReportType = "SPREADSHEET" | "PRODUTOS_POR_DATA_ENTREGA" | "PRODUTOS_POR_PEDIDO"

export type ImportOrderGroup = {
  erpOrderNumber: string
  customerName: string
  issueDate: string | null
  deliveryDate: string | null
  totalValue: number | null
  items: ImportItemRow[]
  kind: "NOVO" | "ATUALIZADO"
  errors: string[]
}

export type ImportPreview = {
  fileName: string
  reportType: ImportReportType
  orders: ImportOrderGroup[]
  rowErrors: string[]
}
