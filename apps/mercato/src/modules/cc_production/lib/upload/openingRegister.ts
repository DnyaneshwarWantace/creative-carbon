import { loadOpeningStock } from '../../../cc_store/lib/opening'
import type { UploadRegister } from './types'

export const openingStockRegister: UploadRegister = {
  key: 'opening_stock',
  label: 'Opening stock',
  department: 'Store',
  paperRef: 'Stock books on cutover day (all stores)',
  hint: 'One row per lot in each store on cutover day. Loaded once: a lot already in stock is refused. Under test / on hold lots stay out of production until passed.',
  dated: true,
  viewFeature: 'cc_store.view',
  manageFeature: 'cc_store.adjust',
  columns: [
    { key: 'asOn', label: 'Stock as on', kind: 'date', required: true, aliases: ['Date', 'Cutover date', 'As on'] },
    { key: 'store', label: 'Store', kind: 'select', required: true, options: ['Warehouse A', 'Warehouse B', 'Resin tank', 'Shop floor', 'FG store'], aliases: ['Location', 'Godown'] },
    { key: 'item', label: 'Item (name or code)', kind: 'text', required: true, aliases: ['Item', 'Material', 'Item name', 'Item code', 'Product'], example: 'Phenol' },
    { key: 'lot', label: 'Lot / batch no.', kind: 'text', required: true, aliases: ['Lot', 'Batch', 'Batch No.', 'Lot No.'], example: 'OPEN-PH-01' },
    { key: 'quantity', label: 'Quantity', kind: 'number', required: true, aliases: ['Qty', 'Kg', 'Balance', 'Stock'], example: '1250.500' },
    { key: 'madeOn', label: 'Made / received on', kind: 'date', aliases: ['Mfg date', 'Received on', 'Coated on'] },
    { key: 'expiry', label: 'Expiry', kind: 'date', aliases: ['Expiry date', 'Use by'] },
    { key: 'status', label: 'QC status', kind: 'select', options: ['Approved', 'Under test', 'On hold'], aliases: ['Status', 'QC'] },
    { key: 'thicknessMm', label: 'Thickness (mm)', kind: 'number', aliases: ['Thickness', 'Thk'] },
    { key: 'size', label: 'Size', kind: 'text', aliases: ['Sheet size', 'Cut size'], example: '8x4' },
    { key: 'grade', label: 'Grade', kind: 'text', example: '10x10' },
    { key: 'pieces', label: 'Pieces (nos)', kind: 'number', aliases: ['Nos', 'Sheets', 'Pcs'] },
    { key: 'gsm', label: 'GSM', kind: 'number' },
    { key: 'note', label: 'Note', kind: 'text', aliases: ['Remark', 'Remarks'] },
  ],
  run: async (ctx, rows, options) => {
    const dates = [...new Set(rows.map((row) => row.values.asOn).filter(Boolean))]
    if (dates.length > 1) return { created: 0, updated: 0, skipped: 0, failed: rows.length, errors: rows.map((row) => ({ row: row.sheetRow, error: `One cutover date per file (found ${dates.join(', ')})` })), plan: [] }
    const cutoverDate = dates[0] ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoverDate)) return { created: 0, updated: 0, skipped: 0, failed: rows.length, errors: rows.map((row) => ({ row: row.sheetRow, error: 'Stock as on must be a date' })), plan: [] }
    const result = await loadOpeningStock(
      ctx,
      cutoverDate,
      rows.map((row) => ({ row: row.sheetRow, ...(row.values as Record<string, string>), store: row.values.store ?? '', item: row.values.item ?? '', lot: row.values.lot ?? '', quantity: row.values.quantity ?? '' })),
      options,
    )
    return { created: result.created, updated: 0, skipped: 0, failed: result.failed, errors: result.errors, plan: result.plan }
  },
}
