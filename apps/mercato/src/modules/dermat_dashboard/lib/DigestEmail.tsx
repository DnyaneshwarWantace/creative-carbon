import * as React from 'react'
import type { WorkItem } from './overview'

const cell: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #e7e5e4', fontSize: 13, verticalAlign: 'top' }
const head: React.CSSProperties = { ...cell, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#78716c', textAlign: 'left' }

export function DigestEmail({ name, date, items, baseUrl }: { name: string; date: string; items: WorkItem[]; baseUrl: string }) {
  const stuck = items.filter((item) => item.stuck).length
  return (
    <div style={{ fontFamily: '-apple-system, Segoe UI, Helvetica, Arial, sans-serif', color: '#1c1917', maxWidth: 680, margin: '0 auto', padding: 24 }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c', margin: 0 }}>Dermat India · {date}</p>
      <h1 style={{ fontSize: 22, margin: '6px 0 4px' }}>Good morning, {name}</h1>
      <p style={{ fontSize: 14, color: '#57534e', margin: '0 0 18px' }}>
        You have {items.length} pending step{items.length === 1 ? '' : 's'}
        {stuck ? `, ${stuck} of them stuck or on hold` : ''}.
      </p>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={head}>Order</th>
            <th style={head}>Step</th>
            <th style={head}>Waiting</th>
            <th style={head}>Note</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.orderId}-${item.stageKey}`}>
              <td style={cell}>
                <a href={`${baseUrl}${item.href}`} style={{ color: '#1c1917', fontWeight: 600, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {item.orderNo}
                </a>
                <div style={{ color: '#78716c', fontSize: 12 }}>{item.customerName}</div>
              </td>
              <td style={cell}>
                {item.stageLabel}
                <div style={{ color: '#78716c', fontSize: 12 }}>{item.department}</div>
              </td>
              <td style={{ ...cell, color: item.stuck ? '#b91c1c' : '#1c1917', fontWeight: item.stuck ? 600 : 400 }}>
                {item.days} day{item.days === 1 ? '' : 's'}
              </td>
              <td style={{ ...cell, color: '#57534e' }}>
                {item.status === 'on_hold' ? `On hold (${item.holdParty ?? '—'}): ${item.holdReason ?? ''}` : item.overdue ? 'Delivery date passed' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#78716c', marginTop: 20 }}>
        Open <a href={`${baseUrl}/backend/my-work`}>My pending work</a> to see and finish these steps.
      </p>
    </div>
  )
}
