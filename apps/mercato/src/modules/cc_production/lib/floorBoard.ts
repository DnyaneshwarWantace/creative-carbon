export type MachineKind = 'reactor' | 'dryer' | 'press'
export type MachineState = 'running' | 'done' | 'idle' | 'breakdown'
export type EntryStatus = 'draft' | 'posted' | 'cancelled'

export type FloorPress = { id: string; number: number; pressType: string; usage: string; isWorking: boolean }
export type FloorPressBatch = { id: string; pressNumber: number; batchNo: string; status: EntryStatus; sheets: number; kg: number }
export type FloorMoulding = { id: string; pressNumber: number; dieNo: string; shift: number; status: EntryStatus; pieces: number }
export type FloorDryer = { id: string; code: string }
export type FloorSheet = { id: string; dryerCode: string; status: EntryStatus; bstageKg: number }
export type FloorReactor = { id: string; code: string }
export type FloorResin = { id: string; reactorCode: string; batchNo: string; grade: string; status: string; yieldKg: number }

export type MachineTile = {
  kind: MachineKind
  key: string
  label: string
  sub: string | null
  state: MachineState
  detail: string
  href: string | null
}

const round3 = (value: number) => Math.round(value * 1000) / 1000

function stateOf(entries: Array<{ status: string }>): MachineState {
  const live = entries.filter((entry) => entry.status !== 'cancelled')
  if (live.some((entry) => entry.status === 'draft')) return 'running'
  if (live.length) return 'done'
  return 'idle'
}

export function pressTiles(presses: FloorPress[], batches: FloorPressBatch[], mouldings: FloorMoulding[]): MachineTile[] {
  return [...presses]
    .sort((left, right) => left.number - right.number)
    .map((press) => {
      const own = batches.filter((batch) => batch.pressNumber === press.number && batch.status !== 'cancelled')
      const dies = mouldings.filter((entry) => entry.pressNumber === press.number && entry.status !== 'cancelled')
      const parts: string[] = []
      if (own.length) parts.push(`${own.length === 1 ? own[0].batchNo : `${own.length} batches`} · ${own.reduce((sum, batch) => sum + batch.sheets, 0)} sheets · ${round3(own.reduce((sum, batch) => sum + batch.kg, 0)).toFixed(3)} kg`)
      if (dies.length) parts.push(`Die ${[...new Set(dies.map((entry) => entry.dieNo))].join(', ')} · ${dies.reduce((sum, entry) => sum + entry.pieces, 0)} pcs`)
      const state: MachineState = !press.isWorking ? 'breakdown' : stateOf([...own, ...dies])
      const first = own[0]
      const firstDie = dies[0]
      return {
        kind: 'press' as const,
        key: `press-${press.number}`,
        label: String(press.number),
        sub: press.pressType === 'big' ? 'Big' : 'Small',
        state,
        detail: state === 'breakdown' ? 'Out of order' : parts.join(' · ') || 'Free',
        href: first ? `/backend/press/batches/${first.id}` : firstDie ? `/backend/moulding/entries/${firstDie.id}` : `/backend/masters/plant/press/${press.id}`,
      }
    })
}

export function dryerTiles(dryers: FloorDryer[], sheets: FloorSheet[]): MachineTile[] {
  return [...dryers]
    .sort((left, right) => left.code.localeCompare(right.code, 'en', { numeric: true }))
    .map((dryer) => {
      const own = sheets.filter((sheet) => sheet.dryerCode === dryer.code && sheet.status !== 'cancelled')
      const kg = round3(own.reduce((sum, sheet) => sum + sheet.bstageKg, 0))
      return { kind: 'dryer' as const, key: `dryer-${dryer.id}`, label: dryer.code, sub: null, state: stateOf(own), detail: own.length ? `${kg.toFixed(3)} kg B-stage` : 'Free', href: own[0] ? `/backend/coating/${own[0].id}` : `/backend/masters/plant/dryer/${dryer.id}` }
    })
}

export function reactorTiles(reactors: FloorReactor[], batches: FloorResin[]): MachineTile[] {
  return [...reactors]
    .sort((left, right) => left.code.localeCompare(right.code, 'en', { numeric: true }))
    .map((reactor) => {
      const own = batches.filter((batch) => batch.reactorCode === reactor.code && batch.status !== 'cancelled')
      const failed = own.some((batch) => batch.status === 'failed')
      const open = own.some((batch) => batch.status === 'draft')
      const state: MachineState = failed && !open ? 'breakdown' : stateOf(own)
      const kg = round3(own.reduce((sum, batch) => sum + batch.yieldKg, 0))
      return {
        kind: 'reactor' as const,
        key: `reactor-${reactor.id}`,
        label: reactor.code,
        sub: null,
        state,
        detail: failed && !open ? `Batch failed · ${own.find((batch) => batch.status === 'failed')?.batchNo ?? ''}` : own.length ? `${own.map((batch) => batch.grade).filter(Boolean).join(', ') || 'Resin'} · ${kg.toFixed(3)} kg` : 'Free',
        href: own[0] ? `/backend/resin/batches/${own[0].id}` : `/backend/masters/plant/reactor/${reactor.id}`,
      }
    })
}

export type StationKey = 'resin' | 'coating' | 'press' | 'moulding' | 'finishing' | 'fg'

export type Station = { key: StationKey; label: string; href: string; running: number; doneKg: number | null; donePieces: number | null; note: string | null }

export function summariseTiles(tiles: MachineTile[]): { total: number; running: number; done: number; idle: number; breakdown: number } {
  const count = (state: MachineState) => tiles.filter((tile) => tile.state === state).length
  return { total: tiles.length, running: count('running'), done: count('done'), idle: count('idle'), breakdown: count('breakdown') }
}
