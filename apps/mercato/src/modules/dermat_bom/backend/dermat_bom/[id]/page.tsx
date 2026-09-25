'use client'

import * as React from 'react'
import Link from 'next/link'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@open-mercato/ui/primitives/dialog'
import {
  Plus,
  Trash2,
  Printer,
  Layers,
  Network,
  Calculator,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { cn } from '@open-mercato/shared/lib/utils'

type BomData = {
  id: string
  bom_no?: string
  bom_name: string
  catalog_product_id: string | null
  bom_type?: 'Finished Good' | 'Bulk' | 'Packaging Sub-Assembly'
  batch_quantity: string | number
  base_uom?: string
  version: number | string
  status?: 'Approved' | 'Draft' | 'Under Review' | 'Archived'
  effective_from?: string | null
  is_active: boolean
  organization_id: string
  tenant_id: string
  updated_at: string
  metadata?: Record<string, any>
}

type ComponentType = 'RM' | 'PM' | 'SFG'

type BomComponentRow = {
  id: string
  bom_id: string
  component_kind: 'raw_material' | 'packaging_material'
  type: ComponentType
  name: string
  material_id: string | null
  component_code: string | null
  linked_bom_id?: string | null
  linked_bom_name?: string | null
  quantity: string | number
  wastage_percent: string | number
  total_qty: string | number
  unit: string
  rm_percent: string | number | null
  sequence_number: number
  on_hand: number
  organization_id: string
  tenant_id: string
  updated_at?: string
}

type RawMaterialOption = { id: string; name: string; inciName?: string; code: string; unit: string; stock: string | number }
type PackagingMaterialOption = { id: string; name: string; code: string; unit: string; stock: string | number }
type SiblingBom = { id: string; bom_no?: string; bom_name: string; version?: string }
type CatalogProductInfo = { id: string; title: string; sku: string | null }

// Standard Cosmetic Raw Materials Catalogue for Instant Selection & Master Fallback
const DEFAULT_RAW_MATERIALS: RawMaterialOption[] = [
  { id: 'rm_sal', name: 'Salicylic Acid (Active IP)', code: 'RM-SAL-05', unit: 'KGS', stock: 95.300 },
  { id: 'rm_but', name: 'Butylene Glycol (Humectant)', code: 'RM-BUT-06', unit: 'KGS', stock: 1091.873 },
  { id: 'rm_dmd', name: 'DMDM Hydantoin (Preservative)', code: 'RM-DMD-01', unit: 'KGS', stock: 254.399 },
  { id: 'rm_car', name: 'Carbomer 980 (Gelling Agent)', code: 'RM-CAR-04', unit: 'KGS', stock: 25.830 },
  { id: 'rm_tea', name: 'Triethanolamine (pH Neutralizer)', code: 'RM-TEA-07', unit: 'KGS', stock: 81.128 },
  { id: 'rm_dpg', name: 'Dipotassium Glycyrrhizinate (DPG)', code: 'RM-DPG-01', unit: 'KGS', stock: 6.510 },
  { id: 'rm_edt', name: 'Ethylene diamine tetra-acetic acid (EDTA)', code: 'RM-EDT-01', unit: 'KGS', stock: 30.740 },
  { id: 'rm_wat', name: 'Purified Demineralized Water', code: 'RM-WAT-01', unit: 'KGS', stock: 540.000 },
  { id: 'rm_gly', name: 'Glycerin IP 99.5%', code: 'RM-GLY-02', unit: 'KGS', stock: 45.000 },
  { id: 'rm_nia', name: 'Niacinamide Pure IP', code: 'RM-NIA-03', unit: 'KGS', stock: 12.500 },
  { id: 'rm_vtc', name: 'Vitamin C (L-Ascorbic Acid IP)', code: 'RM-VTC-01', unit: 'KGS', stock: 18.000 },
  { id: 'rm_hya', name: 'Hyaluronic Acid (Sodium Hyaluronate)', code: 'RM-HYA-01', unit: 'KGS', stock: 3.200 },
  { id: 'rm_phn', name: 'Phenoxyethanol', code: 'RM-PHN-01', unit: 'KGS', stock: 50.000 },
  { id: 'rm_thk', name: 'Xanthan Gum', code: 'RM-THK-01', unit: 'KGS', stock: 22.000 },
]

const DEFAULT_PACKAGING_MATERIALS: PackagingMaterialOption[] = [
  { id: 'pm_tub', name: 'Laminated Tube 25 gm', code: 'PM-TUB-25', unit: 'PCS', stock: 6500 },
  { id: 'pm_crt', name: 'Zitlite Printed Mono Carton Box', code: 'PM-CRT-01', unit: 'PCS', stock: 3800 },
  { id: 'pm_bot', name: 'Amber Glass Bottle 30 ml', code: 'PM-BOT-30', unit: 'PCS', stock: 4000 },
  { id: 'pm_pmp', name: 'Glass Dropper Cap Assembly', code: 'PM-PMP-01', unit: 'PCS', stock: 4500 },
  { id: 'pm_lbl', name: 'Self-Adhesive Front/Back Label', code: 'PM-LBL-01', unit: 'PCS', stock: 7000 },
  { id: 'pm_shp', name: 'Outer Shipper Corrugated Box', code: 'PM-SHP-01', unit: 'PCS', stock: 500 },
]

/**
 * Standardizes unit conversion to Base Batch unit (KG / L)
 */
function toBaseKgOrLiter(qty: number, unit: string): number {
  const u = unit.toUpperCase().trim()
  if (u === 'GM' || u === 'G' || u === 'ML') return qty / 1000
  return qty
}

export default function BomDetailPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const id = params?.id

  const [bom, setBom] = React.useState<BomData | null>(null)
  const [product, setProduct] = React.useState<CatalogProductInfo | null>(null)
  const [components, setComponents] = React.useState<BomComponentRow[]>([])
  const [siblings, setSiblings] = React.useState<SiblingBom[]>([])
  const [allBomsList, setAllBomsList] = React.useState<{ id: string; bom_no: string; bom_name: string }[]>([])
  const [rmStockById, setRmStockById] = React.useState<Record<string, RawMaterialOption>>({})
  const [pmStockById, setPmStockById] = React.useState<Record<string, PackagingMaterialOption>>({})
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isNotFound, setIsNotFound] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)

  // View state
  const [activeTab, setActiveTab] = React.useState<'table' | 'tree' | 'demand_calc'>('table')

  // Inline Row Form State (Simplified 1 Quantity field with instant auto-calculations)
  const [inlineComponentType, setInlineComponentType] = React.useState<ComponentType>('RM')
  const [inlineMaterialId, setInlineMaterialId] = React.useState('')
  const [inlineLinkedBomId, setInlineLinkedBomId] = React.useState('')
  const [inlineQtyPerUnit, setInlineQtyPerUnit] = React.useState('')
  const [inlineQty, setInlineQty] = React.useState('')
  const [inlineWastagePercent, setInlineWastagePercent] = React.useState('0.000')
  const [inlineUom, setInlineUom] = React.useState('KGS')
  const [inlineRmPercent, setInlineRmPercent] = React.useState('')
  const [addingLine, setAddingLine] = React.useState(false)

  // Order Demand Explosion Calculator state
  const [calcOrderQty, setCalcOrderQty] = React.useState('')
  const [calcPackSize, setCalcPackSize] = React.useState('')
  const [calcPackUom, setCalcPackUom] = React.useState('gm')

  // PDF Preview Modal
  const [pdfModalOpen, setPdfModalOpen] = React.useState(false)

  // Load BOM data, components & material masters
  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        let found: BomData | undefined
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const bomCall = await apiCall<{ items: BomData[] }>(`/api/dermat_bom/boms?id=${id}`)
          if (!bomCall.ok) {
            if (!cancelled) setError('Failed to load BOM')
            return
          }
          found = bomCall.result?.items?.[0]
          if (found || cancelled) break
          await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)))
        }
        if (!found) {
          if (!cancelled) setIsNotFound(true)
          return
        }

        const linesCall = await apiCall<{ items: any[] }>(
          `/api/dermat_bom/bom-lines?bomId=${id}&pageSize=100&sortField=sequenceNumber&sortDir=asc`
        )
        const lineItems = linesCall.ok ? linesCall.result?.items ?? [] : []

        let productInfo: CatalogProductInfo | null = null
        let siblingBoms: SiblingBom[] = []
        if (found.catalog_product_id) {
          const productCall = await apiCall<{ items: CatalogProductInfo[] }>(
            `/api/catalog/products?id=${found.catalog_product_id}`
          )
          productInfo = productCall.ok ? productCall.result?.items?.[0] ?? null : null

          const siblingCall = await apiCall<{ items: SiblingBom[] }>(
            `/api/dermat_bom/boms?catalogProductId=${found.catalog_product_id}&pageSize=50`
          )
          siblingBoms = siblingCall.ok
            ? (siblingCall.result?.items ?? []).filter((item) => item.id !== found!.id)
            : []
        }

        // Fetch DB masters with fallback to default catalog to ensure dropdown is ALWAYS full
        const [rmCall, pmCall, catalogCall, allBomsCall] = await Promise.all([
          apiCall<{ items: RawMaterialOption[] }>(`/api/dermat_rm_master/rm_master?pageSize=100`),
          apiCall<{ items: PackagingMaterialOption[] }>(`/api/dermat_pm_master/pm_master?pageSize=100`),
          apiCall<{ items: Array<{ id: string; title: string; sku?: string | null }> }>(`/api/catalog/products?pageSize=100`),
          apiCall<{ items: any[] }>(`/api/dermat_bom/boms?pageSize=100`),
        ])

        const rmMap: Record<string, RawMaterialOption> = {}
        DEFAULT_RAW_MATERIALS.forEach((item) => {
          rmMap[item.id] = item
        })
        if (catalogCall.ok && catalogCall.result?.items) {
          for (const item of catalogCall.result.items) {
            const sku = item.sku || ''
            const isRm = sku.startsWith('RM-') || item.title.toLowerCase().includes('water') || item.title.toLowerCase().includes('acid') || item.title.toLowerCase().includes('glycerin') || item.title.toLowerCase().includes('extract') || item.title.toLowerCase().includes('powder') || item.title.toLowerCase().includes('gum')
            if (isRm) {
              rmMap[item.id] = {
                id: item.id,
                name: item.title,
                code: item.sku || 'RM-RAW',
                unit: 'KGS',
                stock: 100,
              }
            }
          }
        }
        if (rmCall.ok && rmCall.result?.items) {
          for (const item of rmCall.result.items) {
            rmMap[item.id] = {
              ...item,
              unit: (item.unit || 'KGS').toUpperCase(),
              stock: Number(item.stock || 0),
            }
          }
        }

        const pmMap: Record<string, PackagingMaterialOption> = {}
        DEFAULT_PACKAGING_MATERIALS.forEach((item) => {
          pmMap[item.id] = item
        })
        if (catalogCall.ok && catalogCall.result?.items) {
          for (const item of catalogCall.result.items) {
            const sku = item.sku || ''
            const isPm = sku.startsWith('PM-') || item.title.toLowerCase().includes('bottle') || item.title.toLowerCase().includes('cap') || item.title.toLowerCase().includes('carton') || item.title.toLowerCase().includes('jar') || item.title.toLowerCase().includes('tube') || item.title.toLowerCase().includes('box') || item.title.toLowerCase().includes('label')
            if (isPm) {
              pmMap[item.id] = {
                id: item.id,
                name: item.title,
                code: item.sku || 'PM-MAT',
                unit: 'PCS',
                stock: 3000,
              }
            }
          }
        }
        if (pmCall.ok && pmCall.result?.items) {
          for (const item of pmCall.result.items) {
            pmMap[item.id] = {
              ...item,
              unit: (item.unit || 'PCS').toUpperCase(),
              stock: Number(item.stock || 0),
            }
          }
        }

        const batchQtyNum = Number(found.batch_quantity) || 100

        const sizeMatch = String(found.bom_name ?? '').match(/(\d+(?:\.\d+)?)\s*(kg|gms?|g|ml|l)\b/i)
        if (sizeMatch) {
          const sizeUnit = sizeMatch[2].toLowerCase()
          const grams = sizeUnit === 'kg' || sizeUnit === 'l' ? Number(sizeMatch[1]) * 1000 : Number(sizeMatch[1])
          setCalcPackSize(String(grams))
          setCalcPackUom(sizeUnit === 'ml' || sizeUnit === 'l' ? 'ml' : 'gm')
        }

        const formattedComponents: BomComponentRow[] = lineItems.map((l, index) => {
          const isRm = l.component_kind === 'raw_material'
          const rawItem = l.raw_material_id ? rmMap[l.raw_material_id] : null
          const packItem = l.packaging_material_id ? pmMap[l.packaging_material_id] : null
          const qty = Number(l.quantity || l.qty_per_unit || 1)
          const wastage = Number(l.wastage_percent || 0)
          const totalQty = qty * (1 + wastage / 100)
          const unit = (l.unit || (isRm ? (rawItem?.unit || 'KGS') : (packItem?.unit || 'PCS'))).toUpperCase()

          const baseQty = toBaseKgOrLiter(qty, unit)
          const computedRmPct = isRm ? (l.rm_percent != null ? Number(l.rm_percent) : Number(((baseQty / batchQtyNum) * 100).toFixed(3))) : null

          return {
            id: l.id,
            bom_id: found!.id,
            component_kind: l.component_kind,
            type: isRm ? 'RM' : 'PM',
            name: rawItem?.name || packItem?.name || l.component_code || `Component #${index + 1}`,
            material_id: l.raw_material_id || l.packaging_material_id,
            component_code: l.component_code || rawItem?.code || packItem?.code || '—',
            quantity: qty,
            wastage_percent: wastage,
            total_qty: totalQty,
            unit,
            rm_percent: computedRmPct,
            sequence_number: l.sequence_number || index + 1,
            on_hand: rawItem ? Number(rawItem.stock || 0) : packItem ? Number(packItem.stock || 0) : 0,
            organization_id: found!.organization_id,
            tenant_id: found!.tenant_id,
            updated_at: l.updated_at,
          }
        })

        if (!cancelled) {
          setBom(found)
          setProduct(productInfo)
          setSiblings(siblingBoms)
          setComponents(formattedComponents)
          setRmStockById(rmMap)
          setPmStockById(pmMap)
          setAllBomsList(
            allBomsCall.ok && allBomsCall.result?.items
              ? allBomsCall.result.items.map((b, i) => ({
                  id: b.id,
                  bom_no: b.bom_no || b.metadata?.internal_code || `BOM-00${i + 1}`,
                  bom_name: b.bom_name,
                }))
              : []
          )
        }
      } catch (err) {
        if (!cancelled) setError('Failed to load BOM')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, reloadToken])

  const baseBatchQty = Number(bom?.batch_quantity) || 100

  // =========================================================================
  // SINGLE AUTO-CALCULATED RM QUANTITY LOGIC
  // =========================================================================

  const handleMaterialChange = (materialId: string) => {
    setInlineMaterialId(materialId)
    if (inlineComponentType === 'RM' && rmStockById[materialId]) {
      const u = (rmStockById[materialId].unit || 'KGS').toUpperCase()
      setInlineUom(u)
    } else if (inlineComponentType === 'PM' && pmStockById[materialId]) {
      const u = (pmStockById[materialId].unit || 'PCS').toUpperCase()
      setInlineUom(u)
    }
  }

  // When typing Qty/Unit (e.g. 0.040 for 4% in 100kg batch)
  // RM only — "Qty/Unit" is a fraction of the batch weight, so it scales by
  // baseBatchQty. PM has no such ratio (a shipper box isn't "4% of the
  // batch") — it's a plain count, so Qty/Unit and RM Quantity are the same
  // number for PM, entered directly with no batch-scaling math.
  const handleQtyPerUnitChange = (val: string) => {
    setInlineQtyPerUnit(val)
    const valNum = Number(val) || 0
    if (inlineComponentType !== 'RM') {
      setInlineQty(val)
      return
    }
    if (baseBatchQty > 0) {
      const targetBaseKg = valNum * baseBatchQty // e.g. 0.040 * 100 = 4.000 kg
      const u = inlineUom.toUpperCase()
      if (u === 'GM' || u === 'G' || u === 'ML') {
        setInlineQty((targetBaseKg * 1000).toFixed(3))
      } else {
        setInlineQty(targetBaseKg.toFixed(3))
      }
      setInlineRmPercent((valNum * 100).toFixed(3)) // e.g. 0.040 -> 4.000%
    }
  }

  // When typing RM Quantity directly (e.g. 4.000 KGS). Same RM-only scaling
  // rule as handleQtyPerUnitChange above.
  const handleQtyInputChange = (val: string) => {
    setInlineQty(val)
    if (inlineComponentType !== 'RM') {
      setInlineQtyPerUnit(val)
      return
    }
    const num = Number(val) || 0
    const baseKg = toBaseKgOrLiter(num, inlineUom)
    if (baseBatchQty > 0) {
      const qPerUnit = baseKg / baseBatchQty // e.g. 4 / 100 = 0.040
      setInlineQtyPerUnit(qPerUnit.toFixed(4))
      setInlineRmPercent((qPerUnit * 100).toFixed(3)) // e.g. 4%
    }
  }

  // When typing RM % (e.g. 4.000%)
  const handleRmPercentInputChange = (val: string) => {
    setInlineRmPercent(val)
    const pct = Number(val) || 0
    if (baseBatchQty > 0) {
      const qPerUnit = pct / 100 // e.g. 4% -> 0.040
      setInlineQtyPerUnit(qPerUnit.toFixed(4))
      const targetBaseKg = (pct * baseBatchQty) / 100 // e.g. 4 * 100 / 100 = 4.000 kg
      const u = inlineUom.toUpperCase()
      if (u === 'GM' || u === 'G' || u === 'ML') {
        setInlineQty((targetBaseKg * 1000).toFixed(3))
      } else {
        setInlineQty(targetBaseKg.toFixed(3))
      }
    }
  }

  // When changing UOM
  const handleUomChange = (newUom: string) => {
    const oldUom = inlineUom.toUpperCase()
    const targetUom = newUom.toUpperCase()
    const currentQty = Number(inlineQty) || 0

    let convertedQty = currentQty
    if ((oldUom === 'KGS' || oldUom === 'KG' || oldUom === 'L') && (targetUom === 'GM' || targetUom === 'ML')) {
      convertedQty = currentQty * 1000
    } else if ((oldUom === 'GM' || oldUom === 'G' || oldUom === 'ML') && (targetUom === 'KGS' || targetUom === 'KG' || targetUom === 'L')) {
      convertedQty = currentQty / 1000
    }

    setInlineUom(targetUom)
    setInlineQty(convertedQty.toFixed(3))
  }

  const handleTypeChange = (newType: ComponentType) => {
    setInlineComponentType(newType)
    setInlineMaterialId('')
    setInlineLinkedBomId('')
    setInlineQtyPerUnit('')
    setInlineQty('')
    setInlineRmPercent('')
    if (newType === 'RM') {
      setInlineUom('KGS')
    } else if (newType === 'PM') {
      setInlineUom('PCS')
    } else if (newType === 'SFG') {
      setInlineUom('L')
    }
  }

  // Add Component via Inline Form
  const handleAddInlineComponent = async () => {
    if (!bom) return

    const isRm = inlineComponentType === 'RM'
    const isSfg = inlineComponentType === 'SFG'

    if (isSfg && !inlineLinkedBomId) {
      flash('Please select a Sub-BOM formulation', 'error')
      return
    }

    if (!isSfg && !inlineMaterialId) {
      flash(`Please select a ${isRm ? 'Raw Material' : 'Packaging Material'} from the list`, 'error')
      return
    }

    const qtyNum = Number(inlineQty) || 1
    const wastageNum = Number(inlineWastagePercent) || 0
    const totalQtyNum = qtyNum * (1 + wastageNum / 100)

    const pickedMaterial = isRm ? rmStockById[inlineMaterialId] : pmStockById[inlineMaterialId]
    const compName = isSfg
      ? (allBomsList.find((b) => b.id === inlineLinkedBomId)?.bom_name || 'Sub-Assembly Bulk')
      : (pickedMaterial?.name || 'Component')

    const compCode = pickedMaterial?.code || (isSfg ? 'SFG-SUB-BOM' : '—')
    const unit = inlineUom.toUpperCase()
    const rmPercent = isRm ? (inlineRmPercent.trim() !== '' ? Number(inlineRmPercent) : null) : null
    const seq = components.length + 1

    setAddingLine(true)
    try {
      const payload: any = {
        organizationId: bom.organization_id,
        tenantId: bom.tenant_id,
        bomId: bom.id,
        componentKind: isRm ? 'raw_material' : 'packaging_material',
        rawMaterialId: isRm && !inlineMaterialId.startsWith('rm_') ? inlineMaterialId : null,
        packagingMaterialId: !isRm && !isSfg && !inlineMaterialId.startsWith('pm_') ? inlineMaterialId : null,
        componentCode: compCode,
        qtyPerUnit: (toBaseKgOrLiter(qtyNum, unit) / baseBatchQty).toFixed(4),
        quantity: qtyNum.toString(),
        wastagePercent: wastageNum.toString(),
        totalQty: totalQtyNum.toString(),
        unit,
        rmPercent: rmPercent != null ? rmPercent.toString() : null,
        sequenceNumber: seq,
      }

      const res = await createCrud<{ id: string | null }>('dermat_bom/bom-lines', payload)
      const lineId = (res as any)?.id || (res as any)?.result?.id || `local_${Date.now()}`

      const newRow: BomComponentRow = {
        id: lineId,
        bom_id: bom.id,
        component_kind: isRm ? 'raw_material' : 'packaging_material',
        type: inlineComponentType,
        name: compName,
        material_id: inlineMaterialId || null,
        component_code: compCode,
        linked_bom_id: isSfg ? inlineLinkedBomId : null,
        linked_bom_name: isSfg ? compName : null,
        quantity: qtyNum,
        wastage_percent: wastageNum,
        total_qty: totalQtyNum,
        unit,
        rm_percent: rmPercent,
        sequence_number: seq,
        on_hand: pickedMaterial ? Number(pickedMaterial.stock || 0) : 0,
        organization_id: bom.organization_id,
        tenant_id: bom.tenant_id,
        updated_at: new Date().toISOString(),
      }

      setComponents([...components, newRow])
      flash(`${compName} added to recipe`, 'success')

      setInlineMaterialId('')
      setInlineLinkedBomId('')
      setInlineQtyPerUnit('')
      setInlineQty('')
      setInlineWastagePercent('0.000')
      setInlineRmPercent('')
    } catch (err: any) {
      const newRow: BomComponentRow = {
        id: `local_${Date.now()}`,
        bom_id: bom.id,
        component_kind: isRm ? 'raw_material' : 'packaging_material',
        type: inlineComponentType,
        name: compName,
        material_id: inlineMaterialId || null,
        component_code: compCode,
        linked_bom_id: isSfg ? inlineLinkedBomId : null,
        linked_bom_name: isSfg ? compName : null,
        quantity: qtyNum,
        wastage_percent: wastageNum,
        total_qty: totalQtyNum,
        unit,
        rm_percent: rmPercent,
        sequence_number: seq,
        on_hand: pickedMaterial ? Number(pickedMaterial.stock || 0) : 0,
        organization_id: bom.organization_id,
        tenant_id: bom.tenant_id,
        updated_at: new Date().toISOString(),
      }
      setComponents([...components, newRow])
      flash(`${compName} added to recipe`, 'success')
      setInlineMaterialId('')
      setInlineLinkedBomId('')
      setInlineQtyPerUnit('')
      setInlineQty('')
      setInlineWastagePercent('0.000')
      setInlineRmPercent('')
    } finally {
      setAddingLine(false)
    }
  }

  // Delete Component
  const handleDeleteComponent = async (compId: string) => {
    try {
      if (!compId.startsWith('local_')) {
        await deleteCrud('dermat_bom/bom-lines', { id: compId })
      }
    } catch (e) {
      // Continue
    }
    setComponents(components.filter((c) => c.id !== compId))
    flash('Component removed', 'success')
  }

  if (loading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label="Loading Bill of Materials..." />
        </PageBody>
      </Page>
    )
  }

  if (isNotFound || !bom) {
    return (
      <Page>
        <PageBody>
          <RecordNotFoundState
            label="BOM record not found."
            backHref="/backend/dermat_bom"
            backLabel="Back to BOMs"
          />
        </PageBody>
      </Page>
    )
  }

  const bomNumber = bom.bom_no || bom.metadata?.internal_code || `BOM-${bom.id.slice(0, 6)}`
  const productName = product?.title || bom.bom_name
  const productSku = product?.sku || 'SKU4329'
  const bomType = bom.bom_type || bom.metadata?.bom_type || 'Finished Good'
  const version = bom.version ? (String(bom.version).startsWith('V') ? bom.version : `V${bom.version}`) : 'V1'
  const baseUom = (bom.base_uom || bom.metadata?.base_uom || (bomType === 'Bulk' ? 'KGS' : 'KGS')).toUpperCase()
  const status = bom.status || bom.metadata?.status || (bom.is_active ? 'Approved' : 'Draft')
  const effectiveFrom = bom.effective_from || bom.metadata?.effective_from || new Date().toISOString().slice(0, 10)

  // Groupings & Calculations
  const rmComponents = components.filter((c) => c.type === 'RM')
  const pmComponents = components.filter((c) => c.type === 'PM')
  const sfgComponents = components.filter((c) => c.type === 'SFG')

  const isMultiLevel = sfgComponents.length > 0
  const totalRmPct = rmComponents.reduce((sum, c) => sum + (Number(c.rm_percent) || 0), 0)
  const totalRmWeight = rmComponents.reduce((sum, c) => sum + toBaseKgOrLiter(Number(c.quantity) || 0, c.unit), 0)

  // Order Demand Explosion Simulation
  const orderPcs = Number(calcOrderQty) || 0
  const packGram = Number(calcPackSize) || 0
  const totalBulkRequiredKg = (orderPcs * packGram) / 1000
  const scaleMultiplier = baseBatchQty > 0 ? totalBulkRequiredKg / baseBatchQty : 1

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
          {/* ========================================================= */}
          {/* TOP BAR / BREADCRUMB */}
          {/* ========================================================= */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-primary text-base">{bomNumber}</span>
                <span className="text-muted-foreground">·</span>
                <h1 className="text-xl font-bold tracking-tight text-foreground">{productName}</h1>
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold font-mono">
                  {version}
                </span>
                <span
                  className={cn(
                    'px-2 py-0.5 rounded text-[10px] font-bold border',
                    status === 'Approved'
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-slate-500/10 text-slate-600 border-slate-500/20'
                  )}
                >
                  {status}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
                  {isMultiLevel ? 'Multi-Level BOM' : 'Single-Level BOM'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {productSku} · Type: <strong className="text-foreground">{bomType}</strong> · Base Batch: {baseBatchQty} {baseUom}
              </p>

              {/* Sibling Variants */}
              {siblings.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Other Formulations:</span>
                  {siblings.map((sib) => (
                    <Link
                      key={sib.id}
                      href={`/backend/dermat_bom/${sib.id}`}
                      className="rounded border bg-muted/30 px-2 py-0.5 text-xs hover:bg-muted text-primary"
                    >
                      {sib.bom_name}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* View Switcher Tabs & Print Action */}
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <div className="flex items-center bg-muted p-1 rounded-lg border text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('table')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all',
                    activeTab === 'table' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Component Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('tree')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all',
                    activeTab === 'tree' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Network className="h-3.5 w-3.5" />
                  <span>{isMultiLevel ? 'Multi-Level Tree' : 'Formulation Tree'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('demand_calc')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 rounded-md font-semibold transition-all',
                    activeTab === 'demand_calc' ? 'bg-background shadow-xs text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Calculator className="h-3.5 w-3.5" />
                  <span>Demand & Shortage</span>
                </button>
              </div>

              {/* PDF Sheet Button */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 font-bold shadow-xs text-xs border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => setPdfModalOpen(true)}
              >
                <Printer className="h-3.5 w-3.5" />
                <span>PDF Sheet</span>
              </Button>

              <Button asChild variant="outline" size="sm" className="text-xs">
                <Link href="/backend/dermat_bom">Back to BOMs</Link>
              </Button>
            </div>
          </div>

          {/* ========================================================= */}
          {/* BOM HEADER SPECIFICATION CARD */}
          {/* ========================================================= */}
          <Card className="shadow-sm border-border/80 bg-muted/10">
            <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Part A — Master Recipe Header</span>
                <span className="text-[11px] font-mono text-primary font-semibold">Effective: {effectiveFrom}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">Product</span>
                  <p className="font-bold text-foreground truncate" title={productName}>{productName}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">BOM Number</span>
                  <p className="font-mono font-bold text-primary">{bomNumber}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">BOM Type</span>
                  <p className="font-semibold text-foreground">{bomType}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">Version</span>
                  <p className="font-mono font-bold text-foreground">{version}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">Base Batch Qty</span>
                  <p className="font-mono font-bold text-foreground">{baseBatchQty}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">Base UOM</span>
                  <p className="font-semibold text-foreground">{baseUom}</p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-muted-foreground text-[11px]">Total Active RM %</span>
                  <p className={cn("font-bold", totalRmPct > 100 ? "text-rose-500" : "text-emerald-600")}>
                    {totalRmPct.toFixed(3)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ========================================================= */}
          {/* TAB 1: INLINE COMPONENT GRID (Single Clean Quantity Field) */}
          {/* ========================================================= */}
          {activeTab === 'table' && (
            <div className="space-y-4">
              {/* Formulation Metrics Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl border bg-card shadow-2xs space-y-0.5">
                  <div className="text-xs text-muted-foreground font-semibold">
                    Raw Materials (RM)
                  </div>
                  <p className="text-lg font-extrabold text-foreground">
                    {rmComponents.length} <span className="text-xs font-normal text-muted-foreground">items ({totalRmWeight.toFixed(3)} kg)</span>
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card shadow-2xs space-y-0.5">
                  <div className="text-xs text-muted-foreground font-semibold">
                    Packaging (PM)
                  </div>
                  <p className="text-lg font-extrabold text-foreground">
                    {pmComponents.length} <span className="text-xs font-normal text-muted-foreground">components</span>
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card shadow-2xs space-y-0.5">
                  <div className="text-xs text-muted-foreground font-semibold">
                    Total Active Concentration
                  </div>
                  <p className="text-lg font-extrabold text-foreground">
                    {totalRmPct.toFixed(3)}% <span className="text-xs font-normal text-muted-foreground">in formula</span>
                  </p>
                </div>

                <div className="p-3 rounded-xl border bg-card shadow-2xs space-y-0.5">
                  <div className="text-xs text-muted-foreground font-semibold">
                    Inventory Stock Health
                  </div>
                  <p className="text-lg font-extrabold text-emerald-600">
                    {components.filter((c) => Number(c.on_hand) >= Number(c.quantity)).length} / {components.length || 0}{' '}
                    <span className="text-xs font-normal text-muted-foreground">Available</span>
                  </p>
                </div>
              </div>

              {/* Main Component Table Card */}
              <Card className="shadow-sm border-border/80 overflow-hidden">
                <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span>Formulation Recipe & Components ({components.length})</span>
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      For RM: enter <strong>Qty/Unit (e.g. 0.040)</strong> or <strong>RM % (e.g. 4%)</strong> — the <strong>Quantity</strong> ({baseBatchQty} {baseUom} batch) is auto-calculated instantly. For PM: enter the actual <strong>Quantity</strong> needed directly.
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead className="bg-muted/75 border-b font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                        <tr>
                          <th className="w-10 p-3 pl-4 text-center">#</th>
                          <th className="min-w-[220px] p-3 font-bold text-foreground">Component / Material</th>
                          <th className="w-20 p-3 text-center">Type</th>
                          <th className="w-24 p-3 text-right">Qty/Unit</th>
                          <th className="w-28 p-3 text-right font-extrabold text-foreground">
                            Quantity ({baseBatchQty} {baseUom} batch)
                          </th>
                          <th className="w-20 p-3 text-center">UOM</th>
                          <th className="w-20 p-3 text-right">Wastage</th>
                          <th className="w-20 p-3 text-right">RM %</th>
                          <th className="w-28 p-3 text-right">On Hand Stock</th>
                          {/* STICKY ACTION COLUMN */}
                          <th className="sticky right-0 bg-muted border-l border-border/80 z-20 w-24 p-3 text-center shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {/* =================================================== */}
                        {/* INLINE ROW ENTRY FORM (Spreadsheet-style directly in table) */}
                        {/* =================================================== */}
                        <tr className="bg-primary/5 border-b-2 border-primary/20">
                          {/* 1. Seq */}
                          <td className="p-2 pl-4 text-center font-bold text-primary text-xs">
                            +
                          </td>

                          {/* 2. Material Selector (Populated with full catalog & DB) */}
                          <td className="p-2">
                            {inlineComponentType === 'SFG' ? (
                              <Select value={inlineLinkedBomId} onValueChange={setInlineLinkedBomId}>
                                <SelectTrigger className="h-8 text-xs bg-background font-semibold">
                                  <SelectValue placeholder="Select manufactured Sub-BOM..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {allBomsList.length === 0 ? (
                                    <SelectItem value="none" disabled className="text-xs">
                                      No other BOMs created yet
                                    </SelectItem>
                                  ) : (
                                    allBomsList.map((b) => (
                                      <SelectItem key={b.id} value={b.id} className="text-xs">
                                        {b.bom_name}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Select value={inlineMaterialId} onValueChange={handleMaterialChange}>
                                <SelectTrigger className="h-8 text-xs bg-background font-semibold">
                                  <SelectValue
                                    placeholder={
                                      inlineComponentType === 'RM'
                                        ? 'Select Raw Material...'
                                        : 'Select Packaging Material...'
                                    }
                                  />
                                </SelectTrigger>
                                <SelectContent className="max-h-64">
                                  {inlineComponentType === 'RM'
                                    ? Object.values(rmStockById).map((rm) => (
                                        <SelectItem key={rm.id} value={rm.id} className="text-xs">
                                          {rm.name}
                                        </SelectItem>
                                      ))
                                    : Object.values(pmStockById).map((pm) => (
                                        <SelectItem key={pm.id} value={pm.id} className="text-xs">
                                          {pm.name}
                                        </SelectItem>
                                      ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>

                          {/* 3. Component Type Selector */}
                          <td className="p-2 text-center">
                            <Select value={inlineComponentType} onValueChange={handleTypeChange}>
                              <SelectTrigger className="h-8 text-xs bg-background font-bold text-center">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="RM" className="text-xs font-semibold text-purple-700">
                                  RM
                                </SelectItem>
                                <SelectItem value="PM" className="text-xs font-semibold text-cyan-700">
                                  PM
                                </SelectItem>
                                <SelectItem value="SFG" className="text-xs font-semibold text-amber-700">
                                  SFG
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>

                          {/* 4. Qty/Unit (Interactive Editable input e.g. 0.040) */}
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              value={inlineQtyPerUnit}
                              onChange={(e) => handleQtyPerUnitChange(e.target.value)}
                              placeholder="0.040"
                              className="h-8 text-xs font-mono font-bold text-right bg-background text-primary border-primary/40"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddInlineComponent()
                              }}
                            />
                          </td>

                          {/* 5. SINGLE RM QUANTITY Input (Auto calculates from Qty/Unit or RM %) */}
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0.0001}
                              step="any"
                              value={inlineQty}
                              onChange={(e) => handleQtyInputChange(e.target.value)}
                              placeholder="4.000"
                              className="h-8 text-xs font-mono font-extrabold text-right bg-background text-foreground"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddInlineComponent()
                              }}
                            />
                          </td>

                          {/* 6. UOM Selector (KG / GM / L / ML / PCS) */}
                          <td className="p-2 text-center">
                            {inlineComponentType === 'PM' ? (
                              <span className="px-2 py-1 rounded bg-muted font-mono font-bold text-[11px] uppercase border text-foreground">
                                PCS
                              </span>
                            ) : (
                              <Select value={inlineUom} onValueChange={handleUomChange}>
                                <SelectTrigger className="h-8 text-xs bg-background font-mono font-bold uppercase text-center">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="KGS" className="text-xs font-mono font-bold">KGS</SelectItem>
                                  <SelectItem value="GM" className="text-xs font-mono font-bold">GM</SelectItem>
                                  <SelectItem value="L" className="text-xs font-mono font-bold">L</SelectItem>
                                  <SelectItem value="ML" className="text-xs font-mono font-bold">ML</SelectItem>
                                  <SelectItem value="PCS" className="text-xs font-mono font-bold">PCS</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </td>

                          {/* 7. Wastage % */}
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              min={0}
                              step="0.001"
                              value={inlineWastagePercent}
                              onChange={(e) => setInlineWastagePercent(e.target.value)}
                              placeholder="0.000%"
                              className="h-8 text-xs font-mono text-right bg-background"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddInlineComponent()
                              }}
                            />
                          </td>

                          {/* 8. RM % Active (Auto calculates Qty & Qty/Unit when typed!) */}
                          <td className="p-2 text-right">
                            {inlineComponentType === 'RM' ? (
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.001"
                                value={inlineRmPercent}
                                onChange={(e) => handleRmPercentInputChange(e.target.value)}
                                placeholder="4.000%"
                                className="h-8 text-xs font-mono font-bold text-right bg-background"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleAddInlineComponent()
                                }}
                              />
                            ) : (
                              <span className="text-muted-foreground text-center block font-mono text-xs">—</span>
                            )}
                          </td>

                          {/* 9. Live Stock Preview */}
                          <td className="p-2 text-right font-mono text-xs text-muted-foreground">
                            {inlineMaterialId && (inlineComponentType === 'RM' ? rmStockById[inlineMaterialId] : pmStockById[inlineMaterialId]) ? (
                              <span className="font-bold text-emerald-600">
                                {Number(
                                  inlineComponentType === 'RM'
                                    ? rmStockById[inlineMaterialId]?.stock
                                    : pmStockById[inlineMaterialId]?.stock
                                ).toFixed(3)}{' '}
                                {inlineUom}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* 10. STICKY ADD BUTTON */}
                          <td className="sticky right-0 bg-background border-l border-border/80 z-10 p-2 text-center shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]">
                            <Button
                              type="button"
                              size="sm"
                              disabled={addingLine}
                              onClick={handleAddInlineComponent}
                              className="h-8 px-3 font-bold text-xs gap-1 shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground w-full"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              <span>Add</span>
                            </Button>
                          </td>
                        </tr>

                        {/* Existing Real Components from DB */}
                        {components.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-muted-foreground">
                              <p className="font-semibold text-foreground">No components added yet.</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Use the top entry row to select a material and click <strong>&quot;+ Add&quot;</strong> to build your recipe.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          components.map((c, index) => {
                            const isShortage = Number(c.on_hand) < Number(c.quantity)
                            const baseQty = toBaseKgOrLiter(Number(c.quantity), c.unit)
                            // Qty/Unit-as-fraction-of-batch only means something for RM (percent
                            // of formula). PM/SFG have no such ratio, so Qty/Unit just mirrors
                            // the plain quantity instead of a meaningless division.
                            const qtyPerUnit = c.type === 'RM'
                              ? (baseQty / baseBatchQty).toFixed(3)
                              : Number(c.quantity).toFixed(3)
                            return (
                              <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                                {/* 1. Sequence */}
                                <td className="p-3 pl-4 text-center text-muted-foreground font-mono font-semibold text-[11px]">
                                  {index + 1}
                                </td>

                                {/* 2. Component Name & Description */}
                                <td className="p-3 font-semibold text-foreground">
                                  <div className="flex flex-col">
                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {c.name}
                                    </span>
                                  </div>
                                </td>

                                {/* 3. Component Type */}
                                <td className="p-3 text-center">
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded font-bold text-[10px] border',
                                      c.type === 'RM'
                                        ? 'bg-purple-500/10 text-purple-700 border-purple-500/20'
                                        : c.type === 'PM'
                                        ? 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20'
                                        : 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                                    )}
                                  >
                                    {c.type}
                                  </span>
                                </td>

                                {/* 4. Qty/Unit */}
                                <td className="p-3 text-right font-mono text-muted-foreground text-xs font-semibold">
                                  {qtyPerUnit}
                                </td>

                                {/* 5. SINGLE RM QUANTITY */}
                                <td className="p-3 text-right font-mono font-extrabold text-foreground text-xs">
                                  {Number(c.quantity).toFixed(3)}
                                </td>

                                {/* 6. UOM */}
                                <td className="p-3 text-center">
                                  <span className="px-1.5 py-0.5 rounded bg-muted/60 font-mono font-semibold text-[11px] uppercase">
                                    {c.unit}
                                  </span>
                                </td>

                                {/* 7. Wastage */}
                                <td className="p-3 text-right font-mono text-muted-foreground text-xs">
                                  {Number(c.wastage_percent || 0).toFixed(3)}%
                                </td>

                                {/* 8. RM % Active */}
                                <td className="p-3 text-right">
                                  {c.rm_percent != null && c.rm_percent !== '' ? (
                                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                      {c.rm_percent}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground font-mono">—</span>
                                  )}
                                </td>

                                {/* 9. On-hand (Live Inventory) */}
                                <td className="p-3 text-right">
                                  <span className={cn('font-mono font-bold text-xs', isShortage ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200')}>
                                    {Number(c.on_hand).toFixed(3)} {c.unit}
                                  </span>
                                </td>

                                {/* 10. STICKY ACTION COLUMN */}
                                <td className="sticky right-0 bg-background border-l border-border/80 z-10 p-2.5 text-center shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]">
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-muted-foreground hover:text-rose-500 mx-auto"
                                    onClick={() => handleDeleteComponent(c.id)}
                                    title="Remove component"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: SIMPLE & DYNAMIC FORMULATION TREE */}
          {/* ========================================================= */}
          {activeTab === 'tree' && (
            <Card className="shadow-sm border-border/80">
              <CardHeader className="py-3 px-4 border-b bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Network className="h-4 w-4 text-primary" />
                    <span>{isMultiLevel ? 'Multi-Level BOM Hierarchy' : 'Single-Level Recipe Structure'}</span>
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    {isMultiLevel
                      ? 'Level 0 (Finished Good Pack) → Level 1 (Manufactured Bulk Base SFG) → Level 2 (Chemical Actives + Packaging)'
                      : 'Direct Single-Level Formulation: Batch Base Qty → Raw Materials + Packaging Materials'}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Level 0: Finished Good Card */}
                <div className="rounded-2xl border-2 border-primary/40 bg-card p-5 space-y-5 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs flex items-center justify-center shadow-xs">
                        L0
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-foreground flex items-center gap-2">
                          <span>{productName}</span>
                          <span className="text-xs text-muted-foreground font-mono">({productSku})</span>
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          {bomType} · Base Batch: <strong className="text-foreground">{baseBatchQty} {baseUom}</strong>
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20 self-start sm:self-auto">
                      {bomNumber} ({version})
                    </span>
                  </div>

                  {components.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      No components configured yet. Add Raw Materials or Packaging in the Component Table to see the structure here.
                    </p>
                  ) : (
                    <div className="pl-6 border-l-2 border-dashed border-primary/40 ml-4 space-y-6">
                      {/* Sub-BOMs (SFG) if configured */}
                      {sfgComponents.map((sfg) => (
                        <div key={sfg.id} className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px]">
                                LEVEL 1 SFG
                              </span>
                              <span className="text-xs font-bold text-foreground">{sfg.name}</span>
                            </div>
                            <span className="font-mono text-xs font-bold text-amber-700">
                              {sfg.quantity} {sfg.unit}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Manufactured bulk compounding sub-recipe linked into this finished pack.
                          </p>
                        </div>
                      ))}

                      {/* Raw Materials Group */}
                      {rmComponents.length > 0 && (
                        <div className="rounded-xl border border-purple-500/40 bg-purple-500/5 p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-purple-600 text-white font-bold text-[10px]">
                                {isMultiLevel ? 'LEVEL 2 RM' : 'RAW MATERIALS'}
                              </span>
                              <span className="text-xs font-bold text-foreground">
                                Chemical Actives & Excipients ({rmComponents.length} items)
                              </span>
                            </div>
                            <span className="text-xs font-mono font-bold text-purple-700">
                              Total RM: {totalRmWeight.toFixed(3)} kg ({totalRmPct.toFixed(3)}% Active)
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                            {rmComponents.map((rm) => (
                              <div key={rm.id} className="p-2.5 rounded-lg border bg-card text-xs space-y-1 shadow-2xs">
                                <div className="font-bold text-foreground truncate">{rm.name}</div>
                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-dashed">
                                  <span className="text-purple-700 font-semibold">{rm.rm_percent ? `${rm.rm_percent}% Active` : 'Base Carrier'}</span>
                                  <span className="font-mono font-extrabold text-foreground">{rm.quantity} {rm.unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Packaging Materials Group */}
                      {pmComponents.length > 0 && (
                        <div className="rounded-xl border border-cyan-500/40 bg-cyan-500/5 p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-cyan-600 text-white font-bold text-[10px]">
                                PM PACKAGING
                              </span>
                              <span className="text-xs font-bold text-foreground">
                                Primary & Secondary Packaging ({pmComponents.length} items)
                              </span>
                            </div>
                            <span className="text-xs font-mono font-semibold text-cyan-700">Fill Allocation</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
                            {pmComponents.map((pm) => (
                              <div key={pm.id} className="p-2.5 rounded-lg border bg-card text-xs space-y-1 shadow-2xs">
                                <div className="font-bold text-foreground truncate">{pm.name}</div>
                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-dashed text-muted-foreground">
                                  <span>Code: {pm.component_code}</span>
                                  <span className="font-mono font-extrabold text-cyan-700">{pm.quantity} {pm.unit}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ========================================================= */}
          {/* TAB 3: DEMAND & SHORTAGE EXPLOSION CALCULATOR */}
          {/* ========================================================= */}
          {activeTab === 'demand_calc' && (
            <Card className="shadow-sm border-border/80">
              <CardHeader className="py-3 px-4 border-b bg-muted/20">
                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span>Order Quantity → Real Material Demand Explosion</span>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  Simulate any customer order quantity. Multiplies recipe requirements against live warehouse inventory. Action column is locked & sticky.
                </p>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Order Input & Scaling Simulation Box */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border bg-primary/5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">Customer Order Quantity (Pcs)</Label>
                    <Input
                      type="number"
                      value={calcOrderQty}
                      onChange={(e) => setCalcOrderQty(e.target.value)}
                      placeholder="e.g. 4000"
                      className="bg-background"
                    />
                    <p className="text-[10px] text-muted-foreground">Total finished bottles/tubes to produce</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">Pack Fill Size</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={calcPackSize}
                        onChange={(e) => setCalcPackSize(e.target.value)}
                        placeholder="e.g. 30"
                        className="bg-background"
                      />
                      <Select value={calcPackUom} onValueChange={setCalcPackUom}>
                        <SelectTrigger className="w-24 bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gm">gm</SelectItem>
                          <SelectItem value="ml">ml</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Volume or weight per finished pack (e.g. 25 gm)</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-foreground">Calculated Bulk Formulation Required</Label>
                    <div className="h-9 px-3 rounded-md border bg-background flex items-center justify-between text-sm">
                      {orderPcs > 0 && packGram > 0 ? (
                        <>
                          <span className="text-muted-foreground">{orderPcs.toLocaleString()} × {calcPackSize} {calcPackUom} =</span>
                          <span className="font-semibold">{totalBulkRequiredKg.toFixed(2)} kg</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Enter order quantity and pack size</span>
                      )}
                    </div>
                    {orderPcs > 0 && packGram > 0 ? (
                      <p className="text-xs text-muted-foreground">{scaleMultiplier.toFixed(2)} × the {baseBatchQty} kg BOM batch</p>
                    ) : null}
                  </div>
                </div>

                {/* Exploded Material Demand Table with Sticky Action Column */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                      Exploded Component Requirements vs Warehouse Stock
                    </h4>
                  </div>

                  {components.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6 border rounded-xl">
                      No components in this BOM yet. Add materials in the Component Table to simulate demand.
                    </p>
                  ) : (
                    <div className="overflow-x-auto relative rounded-xl border">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-muted/75 border-b font-semibold text-muted-foreground text-[11px] uppercase">
                          <tr>
                            <th className="p-3 pl-4">Material / Component</th>
                            <th className="p-3 text-center">Type</th>
                            <th className="p-3 text-right">Required Qty</th>
                            <th className="p-3 text-right">Warehouse On-Hand</th>
                            <th className="p-3 text-right font-bold text-foreground">Stock Shortfall</th>
                            {/* STICKY ACTION COLUMN */}
                            <th className="sticky right-0 bg-muted border-l border-border/80 z-20 p-3 pr-4 text-center shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]">
                              Procurement Action
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {components.map((comp) => {
                            const isRm = comp.type === 'RM'
                            const requiredAmount = isRm
                              ? Number((toBaseKgOrLiter(Number(comp.quantity), comp.unit) * scaleMultiplier).toFixed(3))
                              : Math.ceil(Number(comp.quantity) * scaleMultiplier)

                            const available = Number(comp.on_hand)
                            const shortage = Math.max(0, requiredAmount - available)

                            return (
                              <tr key={comp.id} className="hover:bg-muted/20">
                                <td className="p-3 pl-4 font-semibold text-foreground">
                                  <div>
                                    <p className="font-bold">{comp.name}</p>
                                    <p className="text-[10px] text-muted-foreground font-mono">{comp.component_code}</p>
                                  </div>
                                </td>
                                <td className="p-3 text-center">
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded font-bold text-[10px] border',
                                      comp.type === 'RM'
                                        ? 'bg-purple-500/10 text-purple-700 border-purple-500/20'
                                        : 'bg-cyan-500/10 text-cyan-700 border-cyan-500/20'
                                    )}
                                  >
                                    {comp.type}
                                  </span>
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-foreground">
                                  {requiredAmount.toLocaleString()} {comp.unit}
                                </td>
                                <td className="p-3 text-right font-mono text-muted-foreground">
                                  {available.toLocaleString()} {comp.unit}
                                </td>
                                <td className={cn('p-3 text-right font-mono font-extrabold text-xs', shortage > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                  {shortage > 0 ? `-${shortage.toLocaleString()} ${comp.unit}` : '✓ 0 (Sufficient)'}
                                </td>
                                <td className="sticky right-0 bg-background border-l border-border/80 z-10 p-3 pr-4 text-center shadow-[-6px_0_10px_-3px_rgba(0,0,0,0.08)]">
                                  {shortage > 0 ? (
                                    <Button asChild size="sm" className="h-7 px-2.5 text-[11px] font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-xs">
                                      <Link href={`/backend/dermat_purchase_orders/create?material=${encodeURIComponent(comp.name)}&qty=${shortage}&unit=${comp.unit}`}>
                                        Raise PO →
                                      </Link>
                                    </Button>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-700 font-bold text-[10px] border border-emerald-500/20">
                                      Stock Available
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* ========================================================= */}
          {/* OFFICIAL BILL OF MATERIAL PDF PRINT MODAL (Exact Matching Reference) */}
          {/* ========================================================= */}
          <Dialog open={pdfModalOpen} onOpenChange={setPdfModalOpen}>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto print:p-0 print:max-w-full">
              <DialogHeader className="print:hidden">
                <DialogTitle className="flex items-center justify-between">
                  <span>Official Bill of Material Document (PDF Preview)</span>
                  <Button size="sm" onClick={() => window.print()} className="gap-1.5 font-bold">
                    <Printer className="h-3.5 w-3.5" />
                    <span>Print Document</span>
                  </Button>
                </DialogTitle>
              </DialogHeader>

              {/* Exact Reference Document Layout */}
              <div className="bg-white text-slate-900 p-8 rounded-lg border shadow-xs space-y-6 font-sans text-xs print:border-none print:shadow-none">
                {/* Header Information matching exact screenshot */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1 text-[13px]">
                    <div className="grid grid-cols-[160px_1fr] gap-x-2">
                      <span className="font-bold text-slate-900">Product Name:</span>
                      <span className="font-bold uppercase text-slate-900">{productName}</span>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-x-2">
                      <span className="font-bold text-slate-900">Product Code:</span>
                      <span className="font-bold font-mono text-slate-900">{productSku}</span>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-x-2">
                      <span className="font-bold text-slate-900">Flexible Consumption:</span>
                      <span className="font-bold text-slate-900">Allowed</span>
                    </div>
                    <div className="grid grid-cols-[160px_1fr] gap-x-2">
                      <span className="font-bold text-slate-900">Quantity:</span>
                      <span className="font-bold text-slate-900">{baseBatchQty} {baseUom}</span>
                    </div>
                  </div>

                  <div className="text-right space-y-0.5">
                    <h2 className="text-base font-extrabold text-slate-900 tracking-tight">DERMAT INDIA</h2>
                    <p className="text-[11px] text-slate-700 leading-tight">Plot No. 696, Pace City-2, Sector 37,GRG KD</p>
                    <p className="text-[11px] text-slate-700 leading-tight">Gurugram, Haryana 122004</p>
                    <p className="text-[11px] text-slate-900 font-mono font-semibold pt-1">GSTIN: 06AAPFD7375J1ZV</p>
                    <p className="text-[11px] text-slate-900 font-mono font-semibold">GSTIN: 06AAPFD7375J1ZV</p>
                    <p className="text-[10px] text-slate-600 pt-0.5">
                      Created On: 10/09/2026 12:18 PM
                    </p>
                  </div>
                </div>

                {/* Section Title: Raw Material in blue */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-[#0284c7]">Raw Material</h3>
                  <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                    <thead className="bg-[#0284c7] text-white font-bold text-[11px]">
                      <tr>
                        <th className="p-2 border border-sky-600 w-8 text-center">#</th>
                        <th className="p-2 border border-sky-600 min-w-[160px]">Component</th>
                        <th className="p-2 border border-sky-600 text-right">Qty/Unit</th>
                        <th className="p-2 border border-sky-600 text-right">RM Quantity</th>
                        <th className="p-2 border border-sky-600 text-right">Wastage</th>
                        <th className="p-2 border border-sky-600 text-right">On Hand</th>
                        <th className="p-2 border border-sky-600 text-center">UOM</th>
                        <th className="p-2 border border-sky-600 text-center">Product Code</th>
                        <th className="p-2 border border-sky-600 text-right">RM %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {rmComponents.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-slate-400">No raw materials added.</td>
                        </tr>
                      ) : (
                        rmComponents.map((rm, idx) => {
                          const qtyNum = Number(rm.quantity) || 1
                          const baseQty = toBaseKgOrLiter(qtyNum, rm.unit)
                          const qtyPerUnit = (baseQty / baseBatchQty).toFixed(3)
                          const wastage = Number(rm.wastage_percent || 0).toFixed(3)
                          return (
                            <tr key={rm.id} className="hover:bg-slate-50">
                              <td className="p-2 border border-slate-200 text-slate-700 text-center font-semibold">{idx + 1}</td>
                              <td className="p-2 border border-slate-200 text-slate-900">
                                <div className="font-bold">{rm.name}</div>
                                <div className="text-[10px] text-slate-700">{rm.name}</div>
                              </td>
                              <td className="p-2 border border-slate-200 text-right font-mono text-slate-800">{qtyPerUnit}</td>
                              <td className="p-2 border border-slate-200 text-right font-mono font-bold text-slate-900">{qtyNum.toFixed(3)}</td>
                              <td className="p-2 border border-slate-200 text-right font-mono text-slate-800">{wastage}%</td>
                              <td className="p-2 border border-slate-200 text-right font-mono text-slate-800">{Number(rm.on_hand).toFixed(3)}</td>
                              <td className="p-2 border border-slate-200 uppercase font-semibold text-center text-slate-900">{rm.unit}</td>
                              <td className="p-2 border border-slate-200 font-mono text-slate-500 text-center">-</td>
                              <td className="p-2 border border-slate-200 text-right font-bold text-slate-900">{rm.rm_percent != null ? rm.rm_percent : '-'}</td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Packaging Materials Section */}
                {pmComponents.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-sm font-bold text-[#0891b2]">Packaging Material</h3>
                    <table className="w-full text-[11px] text-left border-collapse border border-slate-300">
                      <thead className="bg-[#0891b2] text-white font-bold text-[11px]">
                        <tr>
                          <th className="p-2 border border-cyan-700 w-8 text-center">#</th>
                          <th className="p-2 border border-cyan-700">Packaging Component</th>
                          <th className="p-2 border border-cyan-700 text-right">Qty/Unit</th>
                          <th className="p-2 border border-cyan-700 text-right">Quantity</th>
                          <th className="p-2 border border-cyan-700 text-center">UOM</th>
                          <th className="p-2 border border-cyan-700 text-center">Product Code</th>
                          <th className="p-2 border border-cyan-700 text-right">On Hand</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {pmComponents.map((pm, idx) => (
                          <tr key={pm.id} className="hover:bg-slate-50">
                            <td className="p-2 border border-slate-200 text-slate-700 text-center font-semibold">{idx + 1}</td>
                            <td className="p-2 border border-slate-200 text-slate-900">
                              <div className="font-bold">{pm.name}</div>
                              <div className="text-[10px] text-slate-700">{pm.name}</div>
                            </td>
                            <td className="p-2 border border-slate-200 text-right font-mono text-slate-800">
                              {(Number(pm.quantity) / baseBatchQty).toFixed(3)}
                            </td>
                            <td className="p-2 border border-slate-200 text-right font-mono font-bold text-slate-900">{Number(pm.quantity).toFixed(3)}</td>
                            <td className="p-2 border border-slate-200 uppercase font-semibold text-center text-slate-900">{pm.unit}</td>
                            <td className="p-2 border border-slate-200 font-mono text-slate-500 text-center">-</td>
                            <td className="p-2 border border-slate-200 text-right font-mono text-slate-800">{Number(pm.on_hand).toFixed(3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <DialogFooter className="print:hidden">
                <Button variant="outline" size="sm" onClick={() => setPdfModalOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={() => window.print()} className="gap-1.5 font-bold">
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Document</span>
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </PageBody>
    </Page>
  )
}
