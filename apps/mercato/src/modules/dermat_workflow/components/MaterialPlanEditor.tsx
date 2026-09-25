"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs/ComboboxInput'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@open-mercato/ui/primitives/card'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { Input } from '@open-mercato/ui/primitives/input'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { stripInternal } from './types'

type StoreKind = 'raw_material' | 'packaging_material'

type BomOption = {
  bomId: string
  bomName: string
  productId: string | null
  productName: string | null
  packSizeGrams: number | null
  lineCount: number
}

type PlanRow = {
  key: string
  bomId: string
  quantityPcs: number
  packSizeGrams: number | null
  orderId: string | null
  orderNumber: string | null
}

type ResolvedItem = { bomId: string; bomName: string; productName: string | null; bulkKg: number; warning: string | null }

type PlanMaterial = {
  key: string
  materialKind: StoreKind
  materialId: string
  code: string | null
  name: string
  unit: string | null
  required: number
  stock: number
  reservedForPlan: number
  reservedElsewhere: number
  reservedElsewhereRefs: Array<{ ref: string; quantity: number }>
  available: number
  pendingFromVendor: number
  shortfall: number
  usedBy: Array<{ bomName: string; quantity: number }>
}

type Calculation = { items: ResolvedItem[]; materials: PlanMaterial[]; warnings: string[] }

type StoreRequest = { id: string; requestNumber: string; store: StoreKind; status: 'requested' | 'issued' | 'cancelled'; issuedAt: string | null }

type PlanDetail = {
  plan: { id: string; planNumber: string; name: string | null; status: string; updatedAt: string }
  items: Array<ResolvedItem & { quantityPcs: number; packSizeGrams: number | null; orderId: string | null; orderNumber: string | null }>
  requests: StoreRequest[]
}

type CandidateOrder = { orderId: string; orderNumber: string | null; stageName: string | null }

const format = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: 3 })

const PLAN_STATUS: Record<string, StatusBadgeVariant> = { draft: 'neutral', requested: 'info', completed: 'success', cancelled: 'neutral' }
const REQUEST_STATUS: Record<string, StatusBadgeVariant> = { requested: 'warning', issued: 'success', cancelled: 'neutral' }

let rowCounter = 0
const nextKey = () => `row-${Date.now()}-${rowCounter++}`

function toPayload(rows: PlanRow[]) {
  return rows.map((row) => ({
    bomId: row.bomId,
    quantityPcs: row.quantityPcs,
    packSizeGrams: row.packSizeGrams,
    orderId: row.orderId,
    orderNumber: row.orderNumber,
  }))
}

export function MaterialPlanEditor({ planId }: { planId?: string | null }) {
  const t = useT()
  const router = useRouter()
  const [bomOptions, setBomOptions] = React.useState<BomOption[]>([])
  const [detail, setDetail] = React.useState<PlanDetail | null>(null)
  const [loading, setLoading] = React.useState(Boolean(planId))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [name, setName] = React.useState('')
  const [rows, setRows] = React.useState<PlanRow[]>([])
  const [savedSnapshot, setSavedSnapshot] = React.useState('')
  const [calc, setCalc] = React.useState<Calculation | null>(null)
  const [calculating, setCalculating] = React.useState(false)
  const [draftBom, setDraftBom] = React.useState('')
  const [draftPcs, setDraftPcs] = React.useState('')
  const [draftPack, setDraftPack] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)
  const [ordersOpen, setOrdersOpen] = React.useState(false)
  const mutationContextId = 'dermat_workflow.material-plan'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({ contextId: mutationContextId })

  const bomById = React.useMemo(() => new Map(bomOptions.map((bom) => [bom.bomId, bom])), [bomOptions])
  const bomComboOptions = React.useMemo<ComboboxOption[]>(
    () =>
      bomOptions.map((bom) => ({
        value: bom.bomId,
        label: bom.bomName,
        description: [bom.productName, bom.lineCount ? t('dermat_workflow.plan.materialsCount', '{count} materials', { count: bom.lineCount }) : t('dermat_workflow.plan.noMaterials', 'no materials')]
          .filter(Boolean)
          .join(' · '),
      })),
    [bomOptions, t],
  )

  React.useEffect(() => {
    void (async () => {
      const call = await apiCall<{ items: BomOption[] }>('/api/dermat_workflow/material-plans/boms')
      if (call.ok && call.result) setBomOptions(call.result.items)
    })()
  }, [])

  React.useEffect(() => {
    if (!planId) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const call = await apiCall<PlanDetail & { error?: string }>(`/api/dermat_workflow/material-plans/${planId}`)
      if (cancelled) return
      if (!call.ok || !call.result) {
        setLoadError(stripInternal(call.result?.error, t('dermat_workflow.plan.loadError', 'Could not load the plan.')))
      } else {
        const loadedRows = call.result.items.map((item) => ({
          key: nextKey(),
          bomId: item.bomId,
          quantityPcs: item.quantityPcs,
          packSizeGrams: item.packSizeGrams,
          orderId: item.orderId,
          orderNumber: item.orderNumber,
        }))
        setDetail(call.result)
        setName(call.result.plan.name ?? '')
        setRows(loadedRows)
        setSavedSnapshot(JSON.stringify({ name: call.result.plan.name ?? '', items: toPayload(loadedRows) }))
        setLoadError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [planId, reloadToken, t])

  const payloadKey = JSON.stringify(toPayload(rows))
  React.useEffect(() => {
    const items = JSON.parse(payloadKey) as ReturnType<typeof toPayload>
    if (!items.length) {
      setCalc(null)
      return
    }
    let cancelled = false
    setCalculating(true)
    const handle = window.setTimeout(() => {
      void (async () => {
        const call = await apiCall<Calculation>('/api/dermat_workflow/material-plans/calculate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: planId ?? null, items }),
        })
        if (cancelled) return
        if (call.ok && call.result) setCalc(call.result)
        setCalculating(false)
      })()
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [payloadKey, planId, reloadToken])

  const openRequests = (detail?.requests ?? []).filter((request) => request.status !== 'cancelled')
  const locked = openRequests.length > 0
  const dirty = JSON.stringify({ name, items: toPayload(rows) }) !== savedSnapshot
  const draftPcsNumber = Number(draftPcs)
  const draftPackNumber = Number(draftPack)
  const draftBulk = draftPcsNumber > 0 && draftPackNumber > 0 ? (draftPcsNumber * draftPackNumber) / 1000 : null

  const selectDraftBom = (bomId: string) => {
    setDraftBom(bomId)
    const pack = bomById.get(bomId)?.packSizeGrams
    if (pack && !draftPack) setDraftPack(String(pack))
  }

  const addDraft = () => {
    if (!draftBom) {
      flash(t('dermat_workflow.plan.pickBom', 'Choose a BOM.'), 'error')
      return
    }
    if (!(draftPcsNumber > 0)) {
      flash(t('dermat_workflow.plan.enterPcs', 'Enter how many pieces to make.'), 'error')
      return
    }
    setRows((current) => [
      ...current,
      { key: nextKey(), bomId: draftBom, quantityPcs: draftPcsNumber, packSizeGrams: draftPackNumber > 0 ? draftPackNumber : null, orderId: null, orderNumber: null },
    ])
    setDraftBom('')
    setDraftPcs('')
    setDraftPack('')
  }

  const editRow = (row: PlanRow) => {
    setRows((current) => current.filter((entry) => entry.key !== row.key))
    setDraftBom(row.bomId)
    setDraftPcs(String(row.quantityPcs))
    setDraftPack(row.packSizeGrams ? String(row.packSizeGrams) : '')
  }

  const mutate = async <R,>(key: string, url: string, method: 'POST' | 'PUT', payload: Record<string, unknown>) => {
    setBusy(key)
    try {
      return await runMutation({
        operation: async () =>
          apiCall<R & { error?: string }>(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
        context: { formId: mutationContextId, resourceKind: 'dermat_workflow.material_plan', resourceId: planId ?? '', retryLastMutation },
        mutationPayload: payload,
      })
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    if (!rows.length) {
      flash(t('dermat_workflow.plan.noRows', 'Add at least one BOM to the plan.'), 'error')
      return
    }
    const payload = { name: name.trim() || null, items: toPayload(rows) }
    const call = await mutate<{ id: string; planNumber: string }>(
      'save',
      planId ? `/api/dermat_workflow/material-plans/${planId}` : '/api/dermat_workflow/material-plans',
      planId ? 'PUT' : 'POST',
      payload,
    )
    if (!call.ok || !call.result) {
      flash(stripInternal(call.result?.error, t('dermat_workflow.plan.saveError', 'Could not save the plan.')), 'error')
      return
    }
    flash(t('dermat_workflow.plan.saved', 'Plan {number} saved.', { number: call.result.planNumber }), 'success')
    if (!planId) router.replace(`/backend/work/planning/plans/${call.result.id}`)
    else setReloadToken((value) => value + 1)
  }

  const planAction = async (action: 'reserve' | 'clear' | 'send_request' | 'cancel_request', extra: Record<string, unknown> = {}) => {
    if (!planId) return
    const call = await mutate<{ reservedLines?: number; shortMaterials?: number; released?: number; requestNumber?: string }>(
      `${action}:${String(extra.store ?? extra.requestId ?? '')}`,
      `/api/dermat_workflow/material-plans/${planId}/actions`,
      'POST',
      { action, ...extra },
    )
    if (!call.ok || !call.result) {
      flash(stripInternal(call.result?.error, t('dermat_workflow.plan.actionError', 'Could not complete the action.')), 'error')
      return
    }
    if (action === 'send_request') {
      flash(t('dermat_workflow.plan.requestSent', 'Request {number} sent to the store.', { number: call.result.requestNumber ?? '' }), 'success')
    } else if (action === 'cancel_request') {
      flash(t('dermat_workflow.plan.requestCancelled', 'Request {number} cancelled.', { number: call.result.requestNumber ?? '' }), 'success')
    } else if (action === 'clear') {
      flash(t('dermat_workflow.plan.cleared', 'Reservation cleared — the stock is free again.'), 'success')
    } else if ((call.result.shortMaterials ?? 0) > 0) {
      flash(t('dermat_workflow.plan.reservedShort', 'Stock reserved. {count} material(s) are short — see the Short column.', { count: call.result.shortMaterials ?? 0 }), 'warning')
    } else {
      flash(t('dermat_workflow.plan.reserved', 'Stock reserved for this plan. It is not deducted until the store issues it.'), 'success')
    }
    setReloadToken((value) => value + 1)
  }

  const addFromOrders = async (orderIds: string[]) => {
    const call = await apiCall<{ items: Array<Omit<PlanRow, 'key'>>; error?: string }>(
      `/api/dermat_workflow/material-plans/order-items?orderIds=${orderIds.join(',')}`,
    )
    if (!call.ok || !call.result) {
      flash(stripInternal(call.result?.error, t('dermat_workflow.plan.ordersImportError', 'Could not read the orders.')), 'error')
      return false
    }
    if (!call.result.items.length) {
      flash(t('dermat_workflow.plan.ordersNoBom', 'None of the products in these orders has an active BOM.'), 'warning')
      return false
    }
    setRows((current) => [...current, ...call.result!.items.map((item) => ({ ...item, key: nextKey() }))])
    return true
  }

  const itemColumns = React.useMemo<ColumnDef<PlanRow>[]>(
    () => [
      {
        id: 'bom',
        header: t('dermat_workflow.plan.bom', 'BOM'),
        meta: { maxWidth: '320px' },
        cell: ({ row }) => {
          const bom = bomById.get(row.original.bomId)
          const index = rows.findIndex((entry) => entry.key === row.original.key)
          const warning = calc?.items[index]?.warning
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">{bom?.bomName ?? calc?.items[index]?.bomName ?? '—'}</div>
              {bom?.productName ? <div className="truncate text-xs text-muted-foreground">{bom.productName}</div> : null}
              {warning ? <div className="text-xs text-status-warning-text">{warning}</div> : null}
            </div>
          )
        },
      },
      {
        id: 'order',
        header: t('dermat_workflow.plan.forOrder', 'For order'),
        cell: ({ row }) => row.original.orderNumber ?? <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'pcs',
        header: t('dermat_workflow.plan.pieces', 'Pieces'),
        cell: ({ row }) => format(row.original.quantityPcs),
      },
      {
        id: 'pack',
        header: t('dermat_workflow.plan.packSize', 'Pack size (g / ml)'),
        cell: ({ row }) => format(row.original.packSizeGrams),
      },
      {
        id: 'bulk',
        header: t('dermat_workflow.plan.bulkKg', 'Bulk (kg)'),
        cell: ({ row }) => {
          const index = rows.findIndex((entry) => entry.key === row.original.key)
          return format(calc?.items[index]?.bulkKg)
        },
      },
    ],
    [bomById, calc, rows, t],
  )

  if (loading) return <LoadingMessage label={t('dermat_workflow.plan.loading', 'Loading plan…')} />
  if (loadError) return <ErrorMessage label={loadError} />

  const materials = calc?.materials ?? []
  const hasReservation = materials.some((material) => material.reservedForPlan > 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">
              {detail ? detail.plan.planNumber : t('dermat_workflow.plan.newTitle', 'New production plan')}
            </h1>
            {detail ? (
              <StatusBadge variant={PLAN_STATUS[detail.plan.status] ?? 'neutral'}>
                {t(`dermat_workflow.plan.status.${detail.plan.status}`, detail.plan.status)}
              </StatusBadge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {t('dermat_workflow.plan.subtitle', 'Pick the BOMs to make and how many pieces of each. Every BOM is for 100 kg, so the raw and packing material is calculated from the bulk kg and added together across all BOMs.')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/backend/work/planning/plans">{t('dermat_workflow.plan.back', 'All plans')}</Link>
          </Button>
          <Button type="button" onClick={() => void save()} disabled={Boolean(busy) || locked || (!dirty && Boolean(planId))}>
            {busy === 'save' ? <Spinner /> : null}
            {t('dermat_workflow.plan.save', 'Save plan')}
          </Button>
        </div>
      </div>

      {locked ? (
        <Notice
          compact
          message={t('dermat_workflow.plan.lockedHint', 'A request has been sent to the store, so the BOMs are locked. Cancel the open request to change them.')}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('dermat_workflow.plan.bomsTitle', 'What to make')}</CardTitle>
          <CardDescription>{t('dermat_workflow.plan.bomsHint', 'Add as many BOMs as you need. Bulk kg = pieces × pack size ÷ 1000.')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormField label={t('dermat_workflow.plan.name', 'Plan name')}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('dermat_workflow.plan.namePlaceholder', 'e.g. Week 40 serums')}
              disabled={locked}
            />
          </FormField>
          {!locked ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-end">
              <div className="md:col-span-5">
                <FormField label={t('dermat_workflow.plan.bom', 'BOM')}>
                  <ComboboxInput
                    value={draftBom}
                    onChange={selectDraftBom}
                    suggestions={bomComboOptions}
                    resolveLabel={(value) => bomById.get(value)?.bomName ?? value}
                    placeholder={t('dermat_workflow.plan.searchBom', 'Search BOM or product…')}
                    allowCustomValues={false}
                  />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField label={t('dermat_workflow.plan.pieces', 'Pieces')}>
                  <Input type="number" min={0} value={draftPcs} onChange={(event) => setDraftPcs(event.target.value)} placeholder="0" />
                </FormField>
              </div>
              <div className="md:col-span-2">
                <FormField label={t('dermat_workflow.plan.packSize', 'Pack size (g / ml)')}>
                  <Input type="number" min={0} value={draftPack} onChange={(event) => setDraftPack(event.target.value)} placeholder="0" />
                </FormField>
              </div>
              <div className="md:col-span-3 flex items-center gap-2">
                <div className="flex-1 text-sm text-muted-foreground">
                  {draftBulk != null
                    ? t('dermat_workflow.plan.bulkPreview', '= {kg} kg bulk', { kg: format(draftBulk) })
                    : t('dermat_workflow.plan.bulkHint', 'Bulk kg is worked out for you')}
                </div>
                <Button type="button" variant="outline" onClick={addDraft}>
                  {t('dermat_workflow.plan.add', 'Add')}
                </Button>
              </div>
            </div>
          ) : null}
          <DataTable<PlanRow>
            embedded
            columns={itemColumns}
            data={rows}
            actions={
              !locked ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setOrdersOpen(true)}>
                  {t('dermat_workflow.plan.fromOrders', 'Add from orders')}
                </Button>
              ) : undefined
            }
            rowActions={
              locked
                ? undefined
                : (row) => (
                    <RowActions
                      items={[
                        { id: 'edit', label: t('dermat_workflow.plan.edit', 'Edit'), onSelect: () => editRow(row) },
                        {
                          id: 'remove',
                          label: t('dermat_workflow.plan.remove', 'Remove'),
                          destructive: true,
                          onSelect: () => setRows((current) => current.filter((entry) => entry.key !== row.key)),
                        },
                      ]}
                    />
                  )
            }
            emptyState={t('dermat_workflow.plan.emptyRows', 'No BOMs yet — add one above or pull them from orders.')}
          />
        </CardContent>
      </Card>

      {calc?.warnings.length ? <Notice variant="warning" message={calc.warnings.join('\n')} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('dermat_workflow.plan.reserveTitle', 'Reserve stock')}</CardTitle>
          <CardDescription>
            {t('dermat_workflow.plan.reserveHint', 'Optional. Holds free stock for this plan so other orders and plans cannot use it. Nothing is deducted until the store issues the material.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void planAction('reserve')} disabled={!planId || dirty || Boolean(busy) || !materials.length}>
            {busy === 'reserve:' ? <Spinner /> : null}
            {t('dermat_workflow.plan.reserve', 'Reserve stock')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void planAction('clear')} disabled={!planId || Boolean(busy) || !hasReservation}>
            {busy === 'clear:' ? <Spinner /> : null}
            {t('dermat_workflow.plan.clear', 'Clear reservation')}
          </Button>
          {!planId || dirty ? (
            <span className="self-center text-sm text-muted-foreground">{t('dermat_workflow.plan.saveFirst', 'Save the plan first.')}</span>
          ) : null}
        </CardContent>
      </Card>

      {(['raw_material', 'packaging_material'] as StoreKind[]).map((store) => (
        <StoreRequirement
          key={store}
          store={store}
          materials={materials.filter((material) => material.materialKind === store)}
          loading={calculating}
          request={openRequests.find((request) => request.store === store) ?? null}
          issuedRequests={(detail?.requests ?? []).filter((request) => request.store === store && request.status === 'issued')}
          canSend={Boolean(planId) && !dirty && !busy}
          sending={busy === `send_request:${store}`}
          onSend={() => void planAction('send_request', { store })}
          onCancel={(requestId) => void planAction('cancel_request', { requestId })}
        />
      ))}

      <AddFromOrdersDialog open={ordersOpen} onOpenChange={setOrdersOpen} onAdd={addFromOrders} />
    </div>
  )
}

type StoreRequirementProps = {
  store: StoreKind
  materials: PlanMaterial[]
  loading: boolean
  request: StoreRequest | null
  issuedRequests: StoreRequest[]
  canSend: boolean
  sending: boolean
  onSend: () => void
  onCancel: (requestId: string) => void
}

function StoreRequirement({ store, materials, loading, request, issuedRequests, canSend, sending, onSend, onCancel }: StoreRequirementProps) {
  const t = useT()
  const storeName = store === 'raw_material' ? t('dermat_workflow.plan.rmStore', 'RM Store') : t('dermat_workflow.plan.pmStore', 'PM Store')
  const shortCount = materials.filter((material) => material.shortfall > 0).length
  const columns = React.useMemo<ColumnDef<PlanMaterial>[]>(
    () => [
      {
        id: 'material',
        header: t('dermat_workflow.plan.material', 'Material'),
        meta: { maxWidth: '280px' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[row.original.code, row.original.usedBy.map((entry) => entry.bomName).join(', ')].filter(Boolean).join(' · ')}
            </div>
          </div>
        ),
      },
      {
        id: 'required',
        header: t('dermat_workflow.plan.weNeed', 'We need'),
        cell: ({ row }) => `${format(row.original.required)} ${row.original.unit ?? ''}`,
      },
      {
        id: 'stock',
        header: t('dermat_workflow.plan.weHave', 'We have (stock)'),
        cell: ({ row }) => format(row.original.stock),
      },
      {
        id: 'reservedPlan',
        header: t('dermat_workflow.plan.reservedPlan', 'Reserved for this plan'),
        cell: ({ row }) => format(row.original.reservedForPlan),
      },
      {
        id: 'reservedElsewhere',
        header: t('dermat_workflow.plan.reservedElsewhere', 'Reserved elsewhere'),
        meta: { maxWidth: '200px' },
        cell: ({ row }) =>
          row.original.reservedElsewhere > 0 ? (
            <div className="min-w-0">
              <div>{format(row.original.reservedElsewhere)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.reservedElsewhereRefs.map((entry) => `${entry.ref}: ${format(entry.quantity)}`).join(' · ')}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        id: 'available',
        header: t('dermat_workflow.plan.free', 'Free'),
        cell: ({ row }) => format(row.original.available),
      },
      {
        id: 'pending',
        header: t('dermat_workflow.plan.pending', 'Pending from vendor'),
        cell: ({ row }) => format(row.original.pendingFromVendor),
      },
      {
        id: 'short',
        header: t('dermat_workflow.plan.short', 'Short'),
        cell: ({ row }) =>
          row.original.shortfall > 0 ? (
            <StatusBadge variant="warning">{`${format(row.original.shortfall)} ${row.original.unit ?? ''}`}</StatusBadge>
          ) : (
            <StatusBadge variant="success">{t('dermat_workflow.plan.covered', 'Covered')}</StatusBadge>
          ),
      },
    ],
    [t],
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {store === 'raw_material'
                ? t('dermat_workflow.plan.rmTitle', 'Raw material — RM Store')
                : t('dermat_workflow.plan.pmTitle', 'Packing material — PM Store')}
              {shortCount ? <Tag variant="warning">{t('dermat_workflow.plan.shortCount', '{count} short', { count: shortCount })}</Tag> : null}
            </CardTitle>
            <CardDescription>
              {t('dermat_workflow.plan.storeHint', 'What this plan needs from the {store}, against what the store has.', { store: storeName })}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {issuedRequests.map((entry) => (
              <StatusBadge key={entry.id} variant="success">
                {t('dermat_workflow.plan.issuedTag', '{number} issued', { number: entry.requestNumber })}
              </StatusBadge>
            ))}
            {request ? (
              <>
                <StatusBadge variant={REQUEST_STATUS[request.status] ?? 'neutral'}>
                  {t('dermat_workflow.plan.requestOpen', '{number} sent — waiting for store', { number: request.requestNumber })}
                </StatusBadge>
                <Button type="button" variant="outline" size="sm" onClick={() => onCancel(request.id)}>
                  {t('dermat_workflow.plan.cancelRequest', 'Cancel request')}
                </Button>
              </>
            ) : !issuedRequests.length ? (
              <Button type="button" size="sm" onClick={onSend} disabled={!canSend || !materials.length}>
                {sending ? <Spinner /> : null}
                {t('dermat_workflow.plan.sendTo', 'Send request to {store}', { store: storeName })}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DataTable<PlanMaterial>
          embedded
          columns={columns}
          data={materials}
          isLoading={loading && !materials.length}
          emptyState={t('dermat_workflow.plan.noMaterialsForStore', 'Nothing needed from this store yet.')}
        />
      </CardContent>
    </Card>
  )
}

function AddFromOrdersDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (orderIds: string[]) => Promise<boolean>
}) {
  const t = useT()
  const [orders, setOrders] = React.useState<CandidateOrder[]>([])
  const [selected, setSelected] = React.useState<string[]>([])
  const [search, setSearch] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setSelected([])
    setLoading(true)
    void (async () => {
      const call = await apiCall<{ items: CandidateOrder[] }>('/api/dermat_workflow/planning/orders')
      if (call.ok && call.result) setOrders(call.result.items)
      setLoading(false)
    })()
  }, [open])

  const toggle = (orderId: string) =>
    setSelected((current) => (current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]))

  const submit = async () => {
    if (!selected.length || adding) return
    setAdding(true)
    const ok = await onAdd(selected)
    setAdding(false)
    if (ok) onOpenChange(false)
  }

  const term = search.trim().toLowerCase()
  const visible = term ? orders.filter((order) => (order.orderNumber ?? '').toLowerCase().includes(term)) : orders
  const columns: ColumnDef<CandidateOrder>[] = [
    {
      id: 'select',
      header: '',
      cell: ({ row }) => (
        <Checkbox
          checked={selected.includes(row.original.orderId)}
          onCheckedChange={() => toggle(row.original.orderId)}
          onClick={(event) => event.stopPropagation()}
          aria-label={t('dermat_workflow.planning.selectOrder', 'Select order')}
        />
      ),
    },
    { id: 'order', header: t('dermat_workflow.queue.order', 'Order'), cell: ({ row }) => row.original.orderNumber ?? '—' },
    { id: 'stage', header: t('dermat_workflow.queue.stage', 'Stage'), cell: ({ row }) => row.original.stageName ?? '—' },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('dermat_workflow.plan.fromOrdersTitle', 'Add BOMs from orders')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t('dermat_workflow.plan.fromOrdersHint', 'Each product line of the ticked orders is added with its BOM, pieces and pack size. You can edit them after.')}
        </p>
        <DataTable<CandidateOrder>
          embedded
          columns={columns}
          data={visible}
          isLoading={loading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('dermat_workflow.planning.searchOrders', 'Search order number or stage…')}
          onRowClick={(row) => toggle(row.orderId)}
          emptyState={t('dermat_workflow.planning.noOrders', 'No open orders.')}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('dermat_workflow.plan.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!selected.length || adding}>
            {adding ? <Spinner /> : null}
            {t('dermat_workflow.plan.addSelected', 'Add {count} order(s)', { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default MaterialPlanEditor
