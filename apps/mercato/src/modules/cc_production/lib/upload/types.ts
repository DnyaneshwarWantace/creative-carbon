import type { StoreContext } from '../../../cc_store/lib/server'

export type UploadColumnKind = 'text' | 'number' | 'int' | 'date' | 'time' | 'select' | 'bool'

export type UploadColumn = {
  key: string
  label: string
  kind: UploadColumnKind
  required?: boolean
  options?: string[]
  listKey?: string
  aliases?: string[]
  example?: string
  width?: number
}

export type UploadRowError = { row: number; error: string }

export type UploadRunResult = {
  created: number
  updated: number
  skipped: number
  failed: number
  errors: UploadRowError[]
  plan: string[]
}

export type UploadRow = { sheetRow: number; values: Record<string, string> }

export type UploadRegister = {
  key: string
  label: string
  department: string
  paperRef: string | null
  hint: string
  columns: UploadColumn[]
  dated: boolean
  viewFeature: string
  manageFeature: string
  run: (ctx: StoreContext, rows: UploadRow[], options: { dryRun: boolean; byName: string | null }) => Promise<UploadRunResult>
}
