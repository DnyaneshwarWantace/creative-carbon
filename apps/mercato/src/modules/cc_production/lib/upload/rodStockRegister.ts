import { RodStock } from '../../data/entities'
import type { UploadRegister } from './types'

export const rodStockRegister: UploadRegister = {
  key: 'rod_stock',
  label: 'Rod stock',
  department: 'Press & moulding',
  paperRef: 'CCPL Tube Rod List (Excel)',
  hint: 'Rods in stock by OD range, length and quantity. Upload the Tube Rod List as it is; a row already loaded (same Sr. No.) is updated, not added again.',
  dated: false,
  viewFeature: 'cc_production.masters.view',
  manageFeature: 'cc_production.masters.manage',
  columns: [
    { key: 'srNo', label: 'Sr. No.', kind: 'int', required: true, aliases: ['SR.NO.', 'Sr No', 'No'] },
    { key: 'odText', label: 'Rod OD', kind: 'text', required: true, aliases: ['ROD OD', 'OD'], example: '8 to 8.5' },
    { key: 'odFrom', label: 'OD from (mm)', kind: 'number' },
    { key: 'odTo', label: 'OD to (mm)', kind: 'number' },
    { key: 'lengthMm', label: 'Length (mm)', kind: 'int', required: true, aliases: ['LENGTH'] },
    { key: 'quantity', label: 'Qty', kind: 'int', required: true, aliases: ['QTY.', 'Quantity'] },
  ],
  run: async (ctx, rows, options) => {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    const existing = await ctx.em.find(RodStock, { ...scope, deletedAt: null, source: 'tube_rod_list' })
    const errors: Array<{ row: number; error: string }> = []
    let created = 0
    let updated = 0
    let skipped = 0
    const made: RodStock[] = []
    for (const row of rows) {
      const srNo = Number(row.values.srNo)
      const lengthMm = Number(row.values.lengthMm)
      const quantity = Number(row.values.quantity)
      const odText = (row.values.odText ?? '').trim()
      const od = (odText.replace(/,/g, '').match(/\d+(?:\.\d+)?/g) ?? []).map(Number)
      const odFrom = row.values.odFrom ? Number(row.values.odFrom) : od.length ? Math.min(...od) : NaN
      const odToRaw = row.values.odTo ? Number(row.values.odTo) : od.length > 1 ? Math.max(...od) : null
      if (!Number.isInteger(srNo) || !odText || !Number.isFinite(odFrom) || !Number.isFinite(lengthMm) || lengthMm <= 0 || !Number.isFinite(quantity)) {
        errors.push({ row: row.sheetRow, error: 'Needs the Sr. No., the rod OD, the length and the quantity' })
        continue
      }
      const odTo = odToRaw === null || odToRaw === odFrom ? null : odToRaw
      const current = existing.find((entry) => entry.srNo === srNo)
      if (current) {
        const same = current.odText === odText && Number(current.odFrom) === odFrom && (current.odTo == null ? null : Number(current.odTo)) === odTo && current.lengthMm === Math.round(lengthMm) && current.quantity === Math.round(quantity)
        if (same) {
          skipped += 1
          continue
        }
        updated += 1
        if (!options.dryRun) Object.assign(current, { odText, odFrom: odFrom.toFixed(2), odTo: odTo === null ? null : odTo.toFixed(2), lengthMm: Math.round(lengthMm), quantity: Math.round(quantity) })
        continue
      }
      created += 1
      if (!options.dryRun) {
        const rod = ctx.em.create(RodStock, { ...scope, srNo, odText, odFrom: odFrom.toFixed(2), odTo: odTo === null ? null : odTo.toFixed(2), lengthMm: Math.round(lengthMm), quantity: Math.round(quantity), source: 'tube_rod_list' })
        ctx.em.persist(rod)
        made.push(rod)
      }
    }
    if (!options.dryRun) await ctx.em.flush()
    return {
      records: made.map((rod) => ({ type: 'rod_stock', id: rod.id, label: `${rod.odText} × ${rod.lengthMm}`, created: true })),
      created,
      updated,
      skipped,
      failed: errors.length,
      errors,
      plan: [created ? `${created} new rod rows` : null, updated ? `${updated} rod rows updated` : null, skipped ? `${skipped} already the same` : null].filter((line): line is string => Boolean(line)),
    }
  },
}
