export const MONEY_FEATURE = 'dermat_orders.money'

const MONEY_STAGE_FIELDS: Record<string, string[]> = {
  advance: ['advance_percent', 'advance_amount', 'payment_ref'],
}

const MONEY_EVENTS = new Set(['payment', 'payment_override'])

export function withoutMoneyFields(stageKey: string, data: Record<string, unknown>): Record<string, unknown> {
  const hidden = MONEY_STAGE_FIELDS[stageKey]
  if (!hidden) return data
  return Object.fromEntries(Object.entries(data).filter(([key]) => !hidden.includes(key)))
}

export function isMoneyStageField(stageKey: string, fieldKey: string): boolean {
  return (MONEY_STAGE_FIELDS[stageKey] ?? []).includes(fieldKey)
}

export function isMoneyEvent(action: string): boolean {
  return MONEY_EVENTS.has(action)
}
