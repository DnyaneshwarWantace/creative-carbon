export const DEFAULT_TERM = 'due_on_delivery'

export function paymentTermKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function paymentTermLabel(value: string | null | undefined): string {
  if (!value) return ''
  if (value === DEFAULT_TERM) return 'Due on delivery'
  const text = value.replace(/_/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function paymentTermDays(value: string | null | undefined): number | null {
  if (!value) return null
  if (value === DEFAULT_TERM || /deliver|advance|immediate/i.test(value)) return 0
  const match = value.match(/(\d{1,3})/)
  return match ? Number(match[1]) : null
}

export function paymentTermOptions(labels: string[]): Array<{ value: string; label: string }> {
  const seen = new Set<string>()
  const result: Array<{ value: string; label: string }> = []
  for (const label of labels) {
    const value = paymentTermKey(label)
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push({ value, label })
  }
  return result
}
