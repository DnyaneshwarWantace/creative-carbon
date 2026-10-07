import type { WhatsAppMessage } from '../../cc_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../cc_products/lib/whatsapp'
import type { Order } from './types'

const CLIENT_STAGE: Record<string, string> = {
  order: 'order booked',
  advance: 'waiting for the advance / LC',
  allocation: 'material being set aside from stock',
  qc: 'final inspection and testing',
  packing: 'being weighed and packed',
  invoice: 'invoice and documents being prepared',
  dispatch: 'ready for despatch',
}

const SIGN_OFF = ['', 'Thank you,', 'Creative Carbon Composites Pvt. Ltd.']

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null
}

export function customerMessages(order: Order): WhatsAppMessage[] {
  if (order.status === 'cancelled') return []
  const name = order.customer?.name ?? 'Sir / Madam'
  const greeting = `Dear ${name},`
  const ref = `our order ${order.orderNo}${order.customerPoRef ? ` (your PO ${order.customerPoRef})` : ''}`
  const items = order.lines.map((line, index) => {
    const spec = line.specs?.material ?? {}
    const detail = [spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null].filter(Boolean).join(' · ')
    return `${index + 1}. ${line.product?.title ?? 'Item'}${detail ? ` (${detail})` : ''}: ${line.quantity} kg${spec.pieces ? ` / ${spec.pieces} pcs` : ''}`
  })
  const sums = order.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const paidSoFar = order.payments ?? { received: 0, due: 0, items: [] }
  const priced = Boolean(order.totals) && sums.total > 0
  const stage = (key: string) => order.stages.find((entry) => entry.key === key)
  const current = order.stages.filter((entry) => entry.status === 'open' || entry.status === 'on_hold')
  const messages: WhatsAppMessage[] = []

  messages.push({
    key: 'confirm',
    label: 'Order confirmation',
    hint: `${order.lines.length} items${priced ? ` · ${rupeeText(sums.total)}` : ''}`,
    text: [
      greeting,
      '',
      `Thank you for your order. We have booked ${ref} dated ${dateText(order.orderDate)}:`,
      ...items,
      priced ? `\nOrder value incl. GST: ${rupeeText(sums.total)}` : null,
      order.deliveryDate ? `Planned delivery: ${dateText(order.deliveryDate)}` : null,
      order.paymentTerms ? `Payment terms: ${order.paymentTerms}` : null,
      ...SIGN_OFF,
    ]
      .filter((line): line is string => line !== null)
      .join('\n'),
  })

  if (current.length && order.status !== 'completed') {
    messages.push({
      key: 'status',
      label: 'Where the order is now',
      hint: current.map((entry) => entry.label).join(' + '),
      text: [
        greeting,
        '',
        `Update on ${ref}: ${current.map((entry) => CLIENT_STAGE[entry.key] ?? entry.label.toLowerCase()).join(' and ')}.`,
        order.deliveryDate ? `Planned delivery: ${dateText(order.deliveryDate)}.` : null,
        ...SIGN_OFF,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    })
  }

  if (priced && paidSoFar.due > 0) {
    const advance = stage('advance')
    const advancePending = advance && advance.status !== 'done' && advance.status !== 'skipped'
    messages.push({
      key: 'payment',
      label: advancePending ? 'Ask for the advance' : 'Payment reminder',
      hint: `${rupeeText(paidSoFar.due)} due`,
      text: [
        greeting,
        '',
        advancePending
          ? `To start ${ref}, please arrange the advance as per the agreed terms${order.paymentTerms ? ` (${order.paymentTerms})` : ''}.`
          : `A balance of ${rupeeText(paidSoFar.due)} is due on ${ref}.`,
        `Order value: ${rupeeText(sums.total)} · Received: ${rupeeText(paidSoFar.received)} · Due: ${rupeeText(paidSoFar.due)}`,
        'Please share the UTR once paid.',
        ...SIGN_OFF,
      ].join('\n'),
    })
  }

  const dispatch = stage('dispatch')
  const invoice = stage('invoice')
  const dispatchDate = text(dispatch?.data.dispatch_date)
  if (dispatch && dispatchDate) {
    messages.push({
      key: 'dispatch',
      label: 'Despatch details',
      hint: `Sent ${dateText(dispatchDate)}`,
      text: [
        greeting,
        '',
        `${ref.charAt(0).toUpperCase()}${ref.slice(1)} was despatched on ${dateText(dispatchDate)}.`,
        text(invoice?.data.invoice_number) ? `Invoice: ${text(invoice?.data.invoice_number)}${text(invoice?.data.invoice_date) ? ` dated ${dateText(text(invoice?.data.invoice_date))}` : ''}` : null,
        text(dispatch.data.transporter) ? `Transporter: ${text(dispatch.data.transporter)}` : null,
        text(dispatch.data.lr_number) ? `LR / BL no.: ${text(dispatch.data.lr_number)}` : null,
        text(dispatch.data.container_no) ? `Container: ${text(dispatch.data.container_no)}${text(dispatch.data.port) ? ` from ${text(dispatch.data.port)}` : ''}` : null,
        ...items,
        ...SIGN_OFF,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    })
  }
  return messages
}
