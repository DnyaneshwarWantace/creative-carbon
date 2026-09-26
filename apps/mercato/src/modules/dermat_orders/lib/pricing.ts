export type PricedLine = { quantity: number; rate: number | null; gstPercent: number; discountPercent: number }
export type LinePrice = { gross: number; discount: number; taxable: number; gst: number; total: number }

function money(value: number): number {
  return Math.round(value * 100) / 100
}

export function priceLine(line: PricedLine, pricesIncludeGst: boolean): LinePrice {
  const gross = line.quantity * (line.rate ?? 0)
  const discount = gross * (line.discountPercent / 100)
  const net = gross - discount
  const taxable = pricesIncludeGst ? net / (1 + line.gstPercent / 100) : net
  const gst = pricesIncludeGst ? net - taxable : taxable * (line.gstPercent / 100)
  return { gross: money(gross), discount: money(discount), taxable: money(taxable), gst: money(gst), total: money(taxable + gst) }
}

export function priceOrder(lines: PricedLine[], pricesIncludeGst: boolean): LinePrice {
  const priced = lines.map((line) => priceLine(line, pricesIncludeGst))
  const sum = (key: keyof LinePrice) => money(priced.reduce((total, line) => total + line[key], 0))
  return { gross: sum('gross'), discount: sum('discount'), taxable: sum('taxable'), gst: sum('gst'), total: sum('total') }
}
