import * as React from 'react'

export type PoEmailLine = { code: string | null; title: string; quantity: number; unit: string; rate: number; gstPercent: number; amount: number }

export type PoEmailProps = {
  company: { name: string; gstin: string | null; address: string | null; phone: string | null; email: string | null }
  po: { code: string; poDate: string; expectedDate: string | null; vendorName: string; vendorGstin: string | null; terms: string | null; notes: string | null; subtotal: number; gst: number; total: number }
  lines: PoEmailLine[]
  message: string | null
}

const cell: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #e7e5e4', fontSize: 13, verticalAlign: 'top' }
const head: React.CSSProperties = { ...cell, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#78716c', textAlign: 'left' }
const right: React.CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function money(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PoEmail({ company, po, lines, message }: PoEmailProps) {
  return (
    <div style={{ fontFamily: '-apple-system, Segoe UI, Helvetica, Arial, sans-serif', color: '#1c1917', maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c', margin: 0 }}>{company.name}</p>
      <h1 style={{ fontSize: 22, margin: '6px 0 4px' }}>Purchase order {po.code}</h1>
      <p style={{ fontSize: 14, color: '#57534e', margin: '0 0 16px' }}>
        To {po.vendorName}
        {po.vendorGstin ? ` (GSTIN ${po.vendorGstin})` : ''} · dated {po.poDate}
        {po.expectedDate ? ` · please deliver by ${po.expectedDate}` : ''}
      </p>
      {message ? <p style={{ fontSize: 14, whiteSpace: 'pre-line', margin: '0 0 16px' }}>{message}</p> : null}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Item</th>
            <th style={{ ...head, textAlign: 'right' }}>Qty</th>
            <th style={{ ...head, textAlign: 'right' }}>Rate</th>
            <th style={{ ...head, textAlign: 'right' }}>GST</th>
            <th style={{ ...head, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.code ?? line.title}-${index}`}>
              <td style={cell}>
                {line.title}
                {line.code ? <div style={{ color: '#78716c', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' }}>{line.code}</div> : null}
              </td>
              <td style={right}>{line.quantity.toLocaleString('en-IN')} {line.unit}</td>
              <td style={right}>{money(line.rate)}</td>
              <td style={right}>{line.gstPercent}%</td>
              <td style={right}>{money(line.amount)}</td>
            </tr>
          ))}
          <tr>
            <td style={cell} colSpan={4}>Subtotal</td>
            <td style={right}>{money(po.subtotal)}</td>
          </tr>
          <tr>
            <td style={cell} colSpan={4}>GST</td>
            <td style={right}>{money(po.gst)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={4}>Total</td>
            <td style={{ ...right, fontWeight: 700 }}>{money(po.total)}</td>
          </tr>
        </tbody>
      </table>
      {po.terms ? <p style={{ fontSize: 13, margin: '16px 0 0' }}><strong>Terms:</strong> {po.terms}</p> : null}
      {po.notes ? <p style={{ fontSize: 13, margin: '6px 0 0', whiteSpace: 'pre-line' }}><strong>Notes:</strong> {po.notes}</p> : null}
      <p style={{ fontSize: 12, color: '#78716c', margin: '24px 0 0', whiteSpace: 'pre-line' }}>
        {[company.name, company.address, company.gstin ? `GSTIN ${company.gstin}` : null, [company.phone, company.email].filter(Boolean).join(' · ')].filter(Boolean).join('\n')}
      </p>
    </div>
  )
}
