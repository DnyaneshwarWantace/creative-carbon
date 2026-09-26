import type { WhatsAppMessage } from '../../dermat_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../dermat_products/lib/whatsapp'
import type { Order } from './types'

const CLIENT_STAGE: Record<string, string> = {
  order: 'order booked',
  advance: 'waiting for the advance payment',
  sampling: 'sample being prepared / waiting for your sample approval',
  artwork: 'artwork and packing material in progress',
  formulation: 'formula being finalised',
  planning: 'material planning for production',
  manufacturing: 'in manufacturing',
  filling: 'being filled',
  packing: 'being packed',
  qc_qa: 'final quality check',
  billing: 'invoice being prepared',
  dispatch: 'ready for dispatch',
}

const SIGN_OFF = ['', 'Thank you,', 'Dermat India']

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : null
}

export function customerMessages(order: Order): WhatsAppMessage[] {
  if (order.status === 'cancelled') return []
  const name = order.customer?.name ?? 'Sir / Madam'
  const greeting = `Dear ${name},`
  const ref = `our order ${order.orderNo}${order.customerPoRef ? ` (your PO ${order.customerPoRef})` : ''}`
  const items = order.lines.map((line, index) => `${index + 1}. ${line.brandName ? `${line.brandName} ` : ''}${line.product?.title ?? 'Product'}${line.packSize ? ` ${line.packSize}` : ''}: ${line.quantity} pcs`)
  const priced = order.totals.total > 0
  const stage = (key: string) => order.stages.find((entry) => entry.key === key)
  const current = order.stages.filter((entry) => entry.status === 'open' || entry.status === 'on_hold')
  const messages: WhatsAppMessage[] = []

  messages.push({
    key: 'confirm',
    label: 'Order confirmation',
    hint: `${order.lines.length} products${priced ? ` · ${rupeeText(order.totals.total)}` : ''}`,
    text: [
      greeting,
      '',
      `Thank you for your order. We have booked ${ref} dated ${dateText(order.orderDate)}:`,
      ...items,
      priced ? `\nOrder value incl. GST: ${rupeeText(order.totals.total)}` : null,
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

  const sampling = stage('sampling')
  if (sampling && (sampling.status === 'open' || sampling.status === 'on_hold')) {
    const sample = text(sampling.data.sample_name) ?? text(sampling.data.rd_number)
    messages.push({
      key: 'sample',
      label: 'Ask for sample approval',
      hint: sample ? `Sample ${sample}` : 'Sampling is open',
      text: [greeting, '', `The sample for ${ref}${sample ? ` (${sample})` : ''} has been sent to you. Please check it and confirm your approval or the changes you need, so we can start production.`, ...SIGN_OFF].join('\n'),
    })
  }

  const artwork = stage('artwork')
  if (artwork && (artwork.status === 'open' || artwork.status === 'on_hold')) {
    messages.push({
      key: 'artwork',
      label: 'Ask for artwork approval',
      hint: 'Artwork is open',
      text: [greeting, '', `Please approve the artwork for ${ref} (label / carton / tube). Packing material is ordered only after your approval.`, ...SIGN_OFF].join('\n'),
    })
  }

  if (priced && order.payments.due > 0) {
    const advance = stage('advance')
    const advancePending = advance && advance.status !== 'done' && advance.status !== 'skipped'
    messages.push({
      key: 'payment',
      label: advancePending ? 'Ask for the advance' : 'Payment reminder',
      hint: `${rupeeText(order.payments.due)} due`,
      text: [
        greeting,
        '',
        advancePending
          ? `To start ${ref}, please arrange the advance as per the agreed terms${order.paymentTerms ? ` (${order.paymentTerms})` : ''}.`
          : `A balance of ${rupeeText(order.payments.due)} is due on ${ref}.`,
        `Order value: ${rupeeText(order.totals.total)} · Received: ${rupeeText(order.payments.received)} · Due: ${rupeeText(order.payments.due)}`,
        'Please share the UTR once paid.',
        ...SIGN_OFF,
      ].join('\n'),
    })
  }

  const dispatch = stage('dispatch')
  const billing = stage('billing')
  const dispatchDate = text(dispatch?.data.dispatch_date)
  if (dispatch && dispatchDate) {
    messages.push({
      key: 'dispatch',
      label: 'Dispatch details',
      hint: `Sent ${dateText(dispatchDate)}`,
      text: [
        greeting,
        '',
        `${ref.charAt(0).toUpperCase()}${ref.slice(1)} was dispatched on ${dateText(dispatchDate)}.`,
        text(billing?.data.invoice_number) ? `Invoice: ${text(billing?.data.invoice_number)}${text(billing?.data.invoice_date) ? ` dated ${dateText(text(billing?.data.invoice_date))}` : ''}` : null,
        text(dispatch.data.transporter) ? `Transporter: ${text(dispatch.data.transporter)}` : null,
        text(dispatch.data.lr_number) ? `LR / docket no.: ${text(dispatch.data.lr_number)}` : null,
        ...items,
        ...SIGN_OFF,
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    })
  }
  return messages
}
