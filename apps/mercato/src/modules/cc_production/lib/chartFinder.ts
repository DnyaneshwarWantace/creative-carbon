import { CHART_DIMENSIONS } from './masterDefs'

export type ChartRecord = Record<string, string | number | boolean | null | undefined>

export type ChartQuery = {
  family?: string
  text?: string
  dimensions: Record<string, number>
  tolerance: number
}

export type ChartMatch = { entry: ChartRecord; distance: number; hits: string[] }

const DIMENSION_KEYS = CHART_DIMENSIONS.map((dimension) => dimension.key)

export function dimensionValues(raw: string | number | boolean | null | undefined): number[] {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return []
  const found = String(raw).match(/\d+(?:\.\d+)?/g)
  return found ? found.map(Number) : []
}

function closest(values: number[], wanted: number): number | null {
  if (!values.length) return null
  return values.reduce((best, value) => (Math.abs(value - wanted) < Math.abs(best - wanted) ? value : best))
}

export function parseChartQuery(params: URLSearchParams): ChartQuery {
  const dimensions: Record<string, number> = {}
  for (const key of DIMENSION_KEYS) {
    const raw = params.get(key)
    if (raw === null || raw.trim() === '') continue
    const value = Number(raw)
    if (Number.isFinite(value)) dimensions[key] = value
  }
  const tolerance = Number(params.get('tol') ?? 0)
  return { family: params.get('family') || undefined, text: params.get('q')?.trim() || undefined, dimensions, tolerance: Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 0 }
}

export function findInChart(entries: ChartRecord[], query: ChartQuery): ChartMatch[] {
  const wanted = Object.entries(query.dimensions)
  const text = query.text?.toLowerCase()
  const matches: ChartMatch[] = []
  for (const entry of entries) {
    if (query.family && entry.family !== query.family) continue
    if (text && ![entry.code, entry.customerRef, entry.note, entry.cutDrawingNo].some((value) => typeof value === 'string' && value.toLowerCase().includes(text))) continue
    let distance = 0
    const hits: string[] = []
    let ok = true
    for (const [key, target] of wanted) {
      const nearest = closest(dimensionValues(entry[key]), target)
      if (nearest === null || Math.abs(nearest - target) > query.tolerance) {
        ok = false
        break
      }
      distance += Math.abs(nearest - target)
      hits.push(key)
    }
    if (ok) matches.push({ entry, distance, hits })
  }
  return matches.sort((left, right) => left.distance - right.distance || String(left.entry.code ?? '').localeCompare(String(right.entry.code ?? ''), 'en', { numeric: true }))
}
