'use client'

import * as React from 'react'
import Link from 'next/link'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import {
  Trash2,
  Plus,
  Building2,
  Calendar,
  Layers,
  FlaskConical,
  CreditCard,
  Boxes,
  FileText,
  Truck,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Clock,
  Printer,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { updateCrud, createCrud, deleteCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { LoadingMessage, ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { cn } from '@open-mercato/shared/lib/utils'

const UOM_OPTIONS = [
  { value: 'ml', label: 'ml (Milliliter)' },
  { value: 'gm', label: 'gm (Gram)' },
  { value: 'kg', label: 'kg (Kilogram)' },
  { value: 'l', label: 'L (Liter)' },
  { value: 'pcs', label: 'pcs (Pieces)' },
] as const

const GST_RATES = [
  { value: '0', label: '0% (Exempt)' },
  { value: '5', label: '5% GST' },
  { value: '12', label: '12% GST' },
  { value: '18', label: '18% GST' },
  { value: '28', label: '28% GST' },
] as const

const PACKAGING_TYPES = [
  { value: 'Bottle', label: 'Bottle (Dropper / Pump / Flip-top)' },
  { value: 'Jar', label: 'Jar (Glass / Acrylic / PP)' },
  { value: 'Tube', label: 'Tube (Lami / Aluminum / Plastic)' },
  { value: 'Dropper', label: 'Glass Dropper Bottle' },
  { value: 'Pump', label: 'Airless Pump Bottle' },
  { value: 'Sachet', label: 'Sachet / Single Use' },
  { value: 'Custom', label: 'Custom Packaging' },
] as const

type OrderData = {
  id: string
  orderNumber: string
  status: string | null
  statusEntryId: string | null
  paymentStatus: string | null
  fulfillmentStatus: string | null
  currencyCode: string
  taxStrategyKey: string | null
  placedAt?: string | null
  expectedDeliveryAt: string | null
  customerEntityId?: string | null
  customerReference?: string | null
  comments?: string | null
  customerSnapshot?: {
    customer?: {
      id?: string
      displayName?: string
      primaryPhone?: string
      primaryEmail?: string
      customFields?: Record<string, unknown>
    } | null
  } | null
  grandTotalNetAmount: string | number
  grandTotalGrossAmount: string | number
  cf_advance_received_amount?: string | number | null
  cf_advance_received_at?: string | null
  cf_source_deal_id?: string | null
  cf_proforma_invoice_number?: string | null
  cf_transport_arranged?: boolean | null
  cf_customer_po_reference?: string | null
  cf_order_type?: string | null
  cf_priority?: string | null
  cf_sales_poc?: string | null
  cf_packaging_type?: string | null
  cf_pm_source?: string | null
  cf_artwork_requirement?: string | null
  cf_sample_required?: boolean | null
  cf_sample_qty?: string | number | null
  cf_sample_due_date?: string | null
  customFields?: Record<string, unknown>
  metadata?: Record<string, unknown>
  organizationId: string
  tenantId: string
  createdAt: string
  updatedAt: string
}

type CustomerDetail = {
  id: string
  displayName: string
  phone: string | null
  email: string | null
  gstin: string | null
  salesPoc: string | null
  address: string | null
}

type SampleStatus = 'requested' | 'in_preparation' | 'sent' | 'approved' | 'rejected'
// Case-level R&D stage (spec correction, narrowed scope): the single field both the Order
// page's compact panel below and the dedicated dermat_sampling R&D page read/write against
// the SAME record — updating it from either surface reflects immediately on the other.
type SampleRndStage = 'pending' | 'in_progress' | 'completed'

type SampleRow = {
  id: string
  order_id: string
  product_name: string | null
  status: SampleStatus
  rnd_stage: SampleRndStage
  source_order_verified_by: string | null
  requested_by: string | null
  requested_at: string | null
  sent_at: string | null
  customer_decision_at: string | null
  rejection_reason: string | null
  notes: string | null
  organization_id: string
  tenant_id: string
  updated_at: string
}

const RND_STAGE_VARIANT: Record<SampleRndStage, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
}

const RND_STAGE_NEXT: Record<SampleRndStage, SampleRndStage | null> = {
  pending: 'in_progress',
  in_progress: 'completed',
  completed: null,
}

const SAMPLE_STATUS_VARIANT: Record<SampleStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  requested: 'neutral',
  in_preparation: 'info',
  sent: 'warning',
  approved: 'success',
  rejected: 'error',
}

const SAMPLE_NEXT_STATUS: Record<SampleStatus, SampleStatus | null> = {
  requested: 'in_preparation',
  in_preparation: 'sent',
  sent: null,
  approved: null,
  rejected: null,
}

type OrderLineRow = {
  id: string
  order_id: string
  name: string | null
  quantity: string | number
  quantity_unit: string | null
  unit_price_net: string | number | null
  tax_rate: string | number | null
  total_net_amount: string | number | null
  product_id: string | null
  cf_line_kind?: 'fg' | 'rm' | null
  cf_variant_sku?: string | null
  cf_brand_name?: string | null
  cf_pack_size?: string | null
  cf_uom?: string | null
  cf_mrp?: string | number | null
  customFields?: Record<string, unknown>
  metadata?: Record<string, unknown>
  organization_id: string
  tenant_id: string
  updated_at: string
}

function formatINR(amount: string | number | null | undefined): string {
  const numeric = Number(amount ?? 0)
  if (!Number.isFinite(numeric)) return '₹0.00'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(numeric)
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function toDateInput(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export default function OrderBookDetailPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const id = params?.id

  const [order, setOrder] = React.useState<OrderData | null>(null)
  const [customer, setCustomer] = React.useState<CustomerDetail | null>(null)
  const [lines, setLines] = React.useState<OrderLineRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isNotFound, setIsNotFound] = React.useState(false)
  const [reloadToken, setReloadToken] = React.useState(0)
  const orderProgressContext = React.useMemo(
    () => ({ orderId: id, onChanged: () => setReloadToken((value) => value + 1) }),
    [id],
  )

  // Status options

  // Samples
  const [samples, setSamples] = React.useState<SampleRow[]>([])
  const [samplesLoading, setSamplesLoading] = React.useState(false)
  const [requestingSample, setRequestingSample] = React.useState(false)
  const [rejectingSampleId, setRejectingSampleId] = React.useState<string | null>(null)
  const [sampleRejectionReason, setSampleRejectionReason] = React.useState('')

  // Stock check dialog

  // Proforma invoice print preview
  const [proformaOpen, setProformaOpen] = React.useState(false)

  // Add line dialog
  const [addLineOpen, setAddLineOpen] = React.useState(false)
  const [catalogProducts, setCatalogProducts] = React.useState<Array<{ id: string; title: string; sku?: string | null }>>([])
  const [newLineProductId, setNewLineProductId] = React.useState('')
  const [newLineVariant, setNewLineVariant] = React.useState('Standard')
  const [newLineBrand, setNewLineBrand] = React.useState('')
  const [newLinePackSize, setNewLinePackSize] = React.useState('50')
  const [newLineUom, setNewLineUom] = React.useState('ml')
  const [newLineQty, setNewLineQty] = React.useState('100')
  const [newLineRate, setNewLineRate] = React.useState('150')
  const [newLineGst, setNewLineGst] = React.useState('18')
  const [newLineMrp, setNewLineMrp] = React.useState('499')
  const [savingLine, setSavingLine] = React.useState(false)

  // Load Order & Lines
  React.useEffect(() => {
    if (!id) return
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        let found: OrderData | undefined
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const orderCall = await apiCall<{ items: OrderData[] }>(`/api/sales/orders?id=${id}`)
          if (!orderCall.ok) {
            if (!cancelled) setError('Failed to load order')
            return
          }
          found = orderCall.result?.items?.[0]
          if (found || cancelled) break
          await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
        }
        if (!found) {
          if (!cancelled) setIsNotFound(true)
          return
        }

        const linesCall = await apiCall<{ items: OrderLineRow[] }>(`/api/sales/order-lines?orderId=${id}&pageSize=100`)

        // Customer details
        let cust: CustomerDetail | null = null
        const custId = found.customerEntityId || found.customerSnapshot?.customer?.id
        if (custId) {
          const custCall = await apiCall<{ items: Array<{ id: string; display_name?: string; primary_phone?: string | null; primary_email?: string | null; cf_gst_number?: string | null; cf_sales_poc?: string | null; cf_address?: string | null }> }>(
            `/api/customers/companies?id=${custId}`
          )
          const c = custCall.ok ? custCall.result?.items?.[0] : null
          if (c) {
            cust = {
              id: c.id,
              displayName: c.display_name ?? 'Client Company',
              phone: c.primary_phone ?? null,
              email: c.primary_email ?? null,
              gstin: c.cf_gst_number ?? null,
              salesPoc: c.cf_sales_poc ?? null,
              address: c.cf_address ?? null,
            }
          }
        }

        if (!cust && found.customerSnapshot?.customer) {
          const snap = found.customerSnapshot.customer
          cust = {
            id: snap.id ?? '',
            displayName: snap.displayName ?? 'Customer',
            phone: snap.primaryPhone ?? null,
            email: snap.primaryEmail ?? null,
            gstin: (snap.customFields?.gst_number as string) ?? null,
            salesPoc: (snap.customFields?.sales_poc as string) ?? null,
            address: (snap.customFields?.address as string) ?? null,
          }
        }

        if (!cancelled) {
          setOrder(found)
          setCustomer(cust)
          setLines(linesCall.ok ? linesCall.result?.items ?? [] : [])
        }
      } catch {
        if (!cancelled) setError('Failed to load order')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, reloadToken])

  // Load Catalog Products for line adding
  React.useEffect(() => {
    async function loadCatalog() {
      const call = await apiCall<{ items: Array<{ id: string; title: string; sku?: string | null }> }>(
        '/api/catalog/products?pageSize=100'
      )
      if (call.ok) {
        setCatalogProducts(call.result?.items ?? [])
      }
    }
    loadCatalog()
  }, [])

  // Load Samples
  const loadSamples = React.useCallback(async () => {
    if (!id) return
    setSamplesLoading(true)
    try {
      const call = await apiCall<{ items: SampleRow[] }>(
        `/api/dermat_sampling/samples?orderId=${id}&pageSize=50&sortField=createdAt&sortDir=desc`
      )
      setSamples(call.ok ? call.result?.items ?? [] : [])
    } finally {
      setSamplesLoading(false)
    }
  }, [id])

  React.useEffect(() => {
    loadSamples()
  }, [loadSamples, reloadToken])

  // Helpers to read Dermat fields from order
  const orderType = order?.cf_order_type ?? (order?.customFields?.order_type as string) ?? (order?.metadata?.order_type as string) ?? 'New'
  const priority = order?.cf_priority ?? (order?.customFields?.priority as string) ?? (order?.metadata?.priority as string) ?? 'Normal'
  const salesPoc = order?.cf_sales_poc ?? (order?.customFields?.sales_poc as string) ?? (order?.metadata?.sales_poc as string) ?? customer?.salesPoc ?? '—'
  const customerPoRef = order?.cf_customer_po_reference ?? order?.customerReference ?? (order?.customFields?.customer_po_reference as string) ?? ''
  const packagingType = order?.cf_packaging_type ?? (order?.customFields?.packaging_type as string) ?? (order?.metadata?.packaging_type as string) ?? 'Bottle'
  const pmSource = order?.cf_pm_source ?? (order?.customFields?.pm_source as string) ?? (order?.metadata?.pm_source as string) ?? 'dermat'
  const artworkRequirement = order?.cf_artwork_requirement ?? (order?.customFields?.artwork_requirement as string) ?? (order?.metadata?.artwork_requirement as string) ?? 'client'
  const sampleRequired = Boolean(order?.cf_sample_required ?? order?.customFields?.sample_required ?? order?.metadata?.sample_required)
  const advanceAmount = Number(order?.cf_advance_received_amount ?? order?.customFields?.advance_received_amount ?? 0)
  const advanceDate = (order?.cf_advance_received_at ?? order?.customFields?.advance_received_at as string) ?? ''
  const proformaNumber = (order?.cf_proforma_invoice_number ?? order?.customFields?.proforma_invoice_number as string) ?? ''
  const isTransportArranged = Boolean(order?.cf_transport_arranged ?? order?.customFields?.transport_arranged)
  const orderNotes = (order?.comments ?? order?.customFields?.order_notes as string) ?? ''

  // Commit Order Updates
  const commitOrderField = React.useCallback(
    async (payload: Record<string, unknown>) => {
      if (!order) return
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(order.updatedAt), () =>
          updateCrud('sales/orders', { id: order.id, ...payload })
        )
        setReloadToken((t) => t + 1)
        flash('Order updated', 'success')
      } catch (err) {
        if (surfaceRecordConflict(err, t, { onRefresh: () => setReloadToken((prev) => prev + 1) })) return
        flash(err instanceof Error ? err.message : 'Failed to update order', 'error')
        setReloadToken((t) => t + 1)
      }
    },
    [order, t]
  )

  // Handle Order Lines
  const baseLinePayload = React.useCallback(
    (row: OrderLineRow) => ({
      id: row.id,
      orderId: row.order_id,
      currencyCode: order?.currencyCode ?? 'INR',
      quantity: Number(row.quantity),
    }),
    [order]
  )

  const handleUpdateLineField = React.useCallback(
    async (row: OrderLineRow, field: 'quantity' | 'unitPriceNet' | 'taxRate', val: string) => {
      const num = Number(val)
      if (!val.trim().length || Number.isNaN(num) || num < 0) {
        flash('Please enter a valid positive number', 'error')
        setReloadToken((t) => t + 1)
        return
      }
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updated_at), () =>
          updateCrud('sales/order-lines', {
            ...baseLinePayload(row),
            [field]: num,
          })
        )
        setReloadToken((t) => t + 1)
      } catch (err) {
        flash('Failed to update line item', 'error')
        setReloadToken((t) => t + 1)
      }
    },
    [baseLinePayload]
  )

  const handleDeleteLine = React.useCallback(
    async (row: OrderLineRow) => {
      if (lines.length <= 1) {
        flash('Order must have at least one product line', 'error')
        return
      }
      try {
        await deleteCrud('sales/order-lines', { body: { id: row.id, orderId: row.order_id } })
        flash('Product line removed', 'success')
        setReloadToken((t) => t + 1)
      } catch {
        flash('Failed to remove line', 'error')
      }
    },
    [lines.length]
  )

  const handleAddLineSubmit = React.useCallback(async () => {
    if (!order || !newLineProductId) {
      flash('Please select a product from the catalog', 'error')
      return
    }
    setSavingLine(true)
    try {
      const matched = catalogProducts.find((p) => p.id === newLineProductId)
      const qtyNum = Number(newLineQty) || 1
      const rateNum = Number(newLineRate) || 0
      const gstNum = Number(newLineGst) || 18
      const mrpNum = Number(newLineMrp) || 0

      await createCrud('sales/order-lines', {
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        orderId: order.id,
        productId: newLineProductId,
        name: matched?.title || 'Finished Good Item',
        currencyCode: order.currencyCode || 'INR',
        quantity: qtyNum,
        unitPriceNet: rateNum,
        taxRate: gstNum,
        customFields: {
          line_kind: 'fg',
          variant_sku: newLineVariant || 'Standard',
          brand_name: newLineBrand || customer?.displayName || '',
          pack_size: newLinePackSize,
          uom: newLineUom,
          mrp: mrpNum,
        },
      })
      flash('Product line added to order', 'success')
      setAddLineOpen(false)
      setReloadToken((t) => t + 1)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to add line', 'error')
    } finally {
      setSavingLine(false)
    }
  }, [order, newLineProductId, catalogProducts, newLineQty, newLineRate, newLineGst, newLineMrp, newLineVariant, newLineBrand, customer, newLinePackSize, newLineUom])

  // Sample actions
  const handleRequestSample = React.useCallback(async () => {
    if (!order || requestingSample) return
    setRequestingSample(true)
    try {
      const firstLine = lines[0]
      await createCrud('dermat_sampling/samples', {
        organizationId: order.organizationId,
        tenantId: order.tenantId,
        orderId: order.id,
        productName: firstLine?.name ?? 'Formulation Sample',
      })
      flash('R&D Sample trial requested', 'success')
      setReloadToken((t) => t + 1)
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to request sample', 'error')
    } finally {
      setRequestingSample(false)
    }
  }, [order, requestingSample, lines])

  const handleUpdateSampleStatus = React.useCallback(
    async (sample: SampleRow, nextStatus: SampleStatus, rejectionReason?: string) => {
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(sample.updated_at), () =>
          updateCrud('dermat_sampling/samples', { id: sample.id, status: nextStatus, rejectionReason })
        )
        flash(`Sample marked as ${nextStatus.replace('_', ' ')}`, 'success')
        setReloadToken((t) => t + 1)
      } catch (err) {
        flash('Failed to update sample status', 'error')
      }
    },
    []
  )

  // R&D case stage control — writes the SAME `dermat_sampling/samples` record the dedicated
  // R&D page will read/write, so an update here is visible there immediately and vice versa.
  const handleUpdateRndStage = React.useCallback(
    async (sample: SampleRow, nextStage: SampleRndStage) => {
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(sample.updated_at), () =>
          updateCrud('dermat_sampling/samples', { id: sample.id, rndStage: nextStage })
        )
        flash(`R&D case marked as ${nextStage.replace('_', ' ')}`, 'success')
        setReloadToken((t) => t + 1)
      } catch {
        flash('Failed to update R&D stage', 'error')
      }
    },
    []
  )

  if (loading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label="Loading Dermat order details..." />
        </PageBody>
      </Page>
    )
  }

  if (isNotFound) {
    return (
      <Page>
        <PageBody>
          <RecordNotFoundState
            label="Order not found."
            backHref="/backend/sales/order-book"
            backLabel="Back to Order Book"
          />
        </PageBody>
      </Page>
    )
  }

  if (error || !order) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error ?? 'Order not found'} />
        </PageBody>
      </Page>
    )
  }

  // Calculated figures
  const subtotal = lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unit_price_net) || 0), 0)
  const totalTax = lines.reduce((acc, l) => {
    const lineSub = (Number(l.quantity) || 0) * (Number(l.unit_price_net) || 0)
    const gst = Number(l.tax_rate) || 0
    return acc + (lineSub * gst) / 100
  }, 0)
  const grandTotal = subtotal + totalTax
  const balance = Math.max(0, grandTotal - advanceAmount)

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-7xl mx-auto pb-16">
          {/* Header Bar */}
          <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                  <Link href="/backend/sales/order-book">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
                <StatusBadge variant={priority === 'Urgent' ? 'error' : priority === 'High' ? 'warning' : 'neutral'}>
                  {priority} Priority
                </StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground pl-11">
                Dermat India Contract Manufacturing Order • Booked on {formatDate(order.placedAt || order.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/backend/sales/order-book">Back to Order Book</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setProformaOpen(true)}>
                <FileText className="mr-1.5 h-4 w-4" /> Proforma Invoice
              </Button>
              <Button asChild size="sm">
                <Link href="/backend/sales/order-book/create">
                  <Plus className="mr-1.5 h-4 w-4" /> New Order
                </Link>
              </Button>
            </div>
          </div>

          <InjectionSpot
            spotId="detail:dermat_sales_flow.order:progress"
            context={orderProgressContext}
          />

          {/* Top 3 Metric Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order Value (INR)</p>
                  <p className="text-2xl font-extrabold text-foreground mt-1">{formatINR(grandTotal)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Subtotal {formatINR(subtotal)} + GST {formatINR(totalTax)}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  <CreditCard className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Advance Received</p>
                  <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">{formatINR(advanceAmount)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {advanceDate ? `Paid on ${formatDate(advanceDate)}` : 'Pending advance receipt'}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance Outstanding</p>
                  <p className={cn("text-2xl font-extrabold mt-1", balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600")}>
                    {formatINR(balance)}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Target Delivery: <strong>{formatDate(order.expectedDeliveryAt)}</strong>
                  </p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Truck className="h-6 w-6" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Left Column (2 Cols): Customer, Lines, Packaging */}
            <div className="space-y-6 lg:col-span-2">
              {/* Customer & Commercial Info Card */}
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Customer & Commercial Contract Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Client / Company</div>
                      <div className="text-base font-bold text-foreground">
                        {customer?.displayName || order.customerSnapshot?.customer?.displayName || 'Unnamed Customer'}
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5 pt-1">
                        {customer?.gstin ? <div>GSTIN: <span className="font-mono font-semibold text-foreground">{customer.gstin}</span></div> : null}
                        {customer?.phone ? <div>Phone: <span className="text-foreground">{customer.phone}</span></div> : null}
                        {customer?.email ? <div>Email: <span className="text-foreground">{customer.email}</span></div> : null}
                        {customer?.address ? <div>Address: <span className="text-foreground">{customer.address}</span></div> : null}
                      </div>
                    </div>

                    <div className="rounded-lg border bg-muted/20 p-3 space-y-2 text-xs">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Order Metadata</div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Order Type:</span>
                        <StatusBadge variant="neutral">{orderType}</StatusBadge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Sales Executive / POC:</span>
                        <span className="font-medium">{salesPoc}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Customer PO Ref:</span>
                        <span className="font-mono font-semibold">{customerPoRef || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Proforma Invoice #:</span>
                        <span className="font-mono">{proformaNumber || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Editable Dates & PO Reference */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Committed Delivery Date</Label>
                      <Input
                        type="date"
                        defaultValue={toDateInput(order.expectedDeliveryAt)}
                        onBlur={(e) => {
                          const val = e.target.value
                          if (toDateInput(order.expectedDeliveryAt) !== val) {
                            commitOrderField({ expectedDeliveryAt: val ? new Date(val).toISOString() : null })
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Customer PO Reference #</Label>
                      <Input
                        defaultValue={customerPoRef}
                        placeholder="e.g. PO-2026-99"
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (customerPoRef !== val) {
                            commitOrderField({
                              customerReference: val || null,
                              customFields: { ...order.customFields, customer_po_reference: val || null },
                            })
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Proforma Invoice #</Label>
                      <Input
                        defaultValue={proformaNumber}
                        placeholder="e.g. PI-8890"
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (proformaNumber !== val) {
                            commitOrderField({
                              customFields: { ...order.customFields, proforma_invoice_number: val || null },
                            })
                          }
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Product Lines Card (Contract Manufacturing Finished Goods) */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-primary" />
                      Ordered Product Formulations ({lines.length})
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Batch sizes, pack variants, declared MRP and contract billing rates
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setAddLineOpen(true)}>
                    <Plus className="mr-1.5 h-4 w-4" /> Add Product Line
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left text-muted-foreground uppercase text-[10px] font-semibold">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">Product / Formulation</th>
                          <th className="py-2.5 px-3">Pack & Size</th>
                          <th className="py-2.5 px-3 w-24">Order Qty</th>
                          <th className="py-2.5 px-3 w-28">Rate (₹)</th>
                          <th className="py-2.5 px-3 w-20">GST %</th>
                          <th className="py-2.5 px-3 text-right">Taxable</th>
                          <th className="py-2.5 px-3 text-right">Total (₹)</th>
                          <th className="py-2.5 px-3 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {lines.map((line, idx) => {
                          const packSize = line.cf_pack_size ?? (line.customFields?.pack_size as string) ?? '50'
                          const uom = line.cf_uom ?? (line.customFields?.uom as string) ?? line.quantity_unit ?? 'ml'
                          const variant = line.cf_variant_sku ?? (line.customFields?.variant_sku as string) ?? 'Standard'
                          const brand = line.cf_brand_name ?? (line.customFields?.brand_name as string) ?? customer?.displayName ?? ''
                          const mrp = line.cf_mrp ?? (line.customFields?.mrp as string | number) ?? ''

                          const qty = Number(line.quantity) || 0
                          const rate = Number(line.unit_price_net) || 0
                          const gst = Number(line.tax_rate) || 0
                          const lineSub = qty * rate
                          const lineTax = (lineSub * gst) / 100
                          const lineTotal = lineSub + lineTax

                          return (
                            <tr key={line.id} className="hover:bg-muted/20">
                              <td className="py-3 px-3 font-semibold text-muted-foreground">{idx + 1}</td>
                              <td className="py-3 px-3">
                                <div className="font-semibold text-foreground text-sm">{line.name}</div>
                                <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                  <span>Brand: <strong>{brand || 'Client Brand'}</strong></span>
                                  <span>•</span>
                                  <span>Variant: <strong>{variant}</strong></span>
                                  {mrp ? (
                                    <>
                                      <span>•</span>
                                      <span>MRP: <strong>₹{mrp}</strong></span>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <span className="rounded bg-muted px-2 py-1 font-medium text-xs">
                                  {packSize} {uom}
                                </span>
                              </td>
                              <td className="py-3 px-3">
                                <Input
                                  type="number"
                                  min={1}
                                  defaultValue={String(line.quantity)}
                                  className="h-8 text-xs font-semibold"
                                  onBlur={(e) => handleUpdateLineField(line, 'quantity', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-3">
                                <Input
                                  type="number"
                                  min={0}
                                  defaultValue={String(line.unit_price_net ?? 0)}
                                  className="h-8 text-xs font-semibold"
                                  onBlur={(e) => handleUpdateLineField(line, 'unitPriceNet', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-3">
                                <Input
                                  type="number"
                                  min={0}
                                  defaultValue={String(line.tax_rate ?? 18)}
                                  className="h-8 text-xs"
                                  onBlur={(e) => handleUpdateLineField(line, 'taxRate', e.target.value)}
                                />
                              </td>
                              <td className="py-3 px-3 text-right text-muted-foreground font-medium">
                                {formatINR(lineSub)}
                              </td>
                              <td className="py-3 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                {formatINR(lineTotal)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteLine(line)}
                                  disabled={lines.length <= 1}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Bar */}
                  <div className="border-t bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                    <div className="text-muted-foreground">
                      Total Ordered Units: <strong>{lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0)} units</strong> across {lines.length} formulation lines
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <span className="text-muted-foreground">Taxable Subtotal: </span>
                        <strong>{formatINR(subtotal)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">GST Tax: </span>
                        <strong>{formatINR(totalTax)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Grand Total: </span>
                        <strong className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatINR(grandTotal)}</strong>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Packaging, Artwork & Logistics Specifications */}
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Packaging, Artwork & Logistics Specifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div className="space-y-1">
                      <Label className="text-xs">Primary Packaging Type</Label>
                      <Select
                        value={packagingType}
                        onValueChange={(val) => commitOrderField({ customFields: { ...order.customFields, packaging_type: val } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PACKAGING_TYPES.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">PM Sourced By</Label>
                      <Select
                        value={pmSource}
                        onValueChange={(val) => commitOrderField({ customFields: { ...order.customFields, pm_source: val } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dermat">Dermat India Sourced</SelectItem>
                          <SelectItem value="client">Client / Party Supplied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Artwork & Label Status</Label>
                      <Select
                        value={artworkRequirement}
                        onValueChange={(val) => commitOrderField({ customFields: { ...order.customFields, artwork_requirement: val } })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client">Client Provided Artwork</SelectItem>
                          <SelectItem value="in_house">In-House Design Studio</SelectItem>
                          <SelectItem value="approved">Existing Approved Artwork</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                      <Checkbox
                        checked={isTransportArranged}
                        onCheckedChange={(checked) =>
                          commitOrderField({ customFields: { ...order.customFields, transport_arranged: checked === true } })
                        }
                      />
                      Transport & Dispatch Logistics Arranged by Dermat India
                    </label>
                  </div>

                  <div className="space-y-1 pt-1">
                    <Label className="text-xs">Special Instructions & Batch Notes</Label>
                    <Textarea
                      rows={2}
                      defaultValue={orderNotes}
                      placeholder="e.g. Fragrance batching notes, carton marking, packing instructions..."
                      className="text-xs"
                      onBlur={(e) => {
                        const val = e.target.value.trim()
                        if (orderNotes !== val) {
                          commitOrderField({ comments: val || null, customFields: { ...order.customFields, order_notes: val || null } })
                        }
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Column (1 Col): Order Status, Advance Payment, R&D Samples */}
            <div className="space-y-6">
              {/* Order Status Card */}
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Order Dates
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="rounded-lg border bg-muted/20 p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Order Date:</span>
                      <strong>{formatDate(order.placedAt || order.createdAt)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Target Delivery:</span>
                      <strong>{formatDate(order.expectedDeliveryAt)}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Order Type:</span>
                      <span className="font-semibold">{orderType}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Commercial & Advance Payment Card */}
              <Card>
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Advance & Payment Accounting
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Advance Payment Received (₹)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={String(advanceAmount || '')}
                      placeholder="0.00"
                      onBlur={(e) => {
                        const val = e.target.value.trim()
                        const num = Number(val) || 0
                        if (advanceAmount !== num) {
                          commitOrderField({ customFields: { ...order.customFields, advance_received_amount: num } })
                        }
                      }}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Advance Receipt Date</Label>
                    <Input
                      type="date"
                      defaultValue={toDateInput(advanceDate)}
                      onBlur={(e) => {
                        const val = e.target.value
                        if (toDateInput(advanceDate) !== val) {
                          commitOrderField({ customFields: { ...order.customFields, advance_received_at: val || null } })
                        }
                      }}
                    />
                  </div>

                  <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/20 p-3 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Order Amount:</span>
                      <span className="font-bold">{formatINR(grandTotal)}</span>
                    </div>
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                      <span>Advance Credited:</span>
                      <span className="font-bold">-{formatINR(advanceAmount)}</span>
                    </div>
                    <div className="border-t pt-1 flex items-center justify-between font-bold text-foreground">
                      <span>Remaining Balance:</span>
                      <span className={balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}>
                        {formatINR(balance)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* R&D Lab Sampling Gate Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" />
                    R&D & Lab Trial Samples
                  </CardTitle>
                  {samples.length === 0 ? (
                    <Button size="sm" variant="outline" onClick={handleRequestSample} disabled={requestingSample}>
                      {requestingSample ? <Spinner className="mr-1.5 h-3.5 w-3.5" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                      Request Sample
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="pt-4 space-y-3">
                  {samplesLoading ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">Loading lab samples...</div>
                  ) : samples.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground space-y-2">
                      <p>No R&D sample trials logged for this order yet.</p>
                      <Button size="sm" variant="secondary" onClick={handleRequestSample} disabled={requestingSample}>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
                        Initiate Lab Trial Sample
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {samples.map((sample) => {
                        const next = SAMPLE_NEXT_STATUS[sample.status]
                        const isRejecting = rejectingSampleId === sample.id

                        const rndNext = RND_STAGE_NEXT[sample.rnd_stage]

                        return (
                          <div key={sample.id} className="rounded-lg border p-3 text-xs space-y-2 bg-muted/10">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{sample.product_name || 'Lab Trial Sample'}</span>
                              <StatusBadge variant={SAMPLE_STATUS_VARIANT[sample.status]}>
                                {sample.status.replace(/_/g, ' ')}
                              </StatusBadge>
                            </div>

                            <div className="flex items-center justify-between rounded-md border bg-background/60 px-2 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-muted-foreground">R&D case:</span>
                                <StatusBadge variant={RND_STAGE_VARIANT[sample.rnd_stage]}>
                                  {sample.rnd_stage.replace(/_/g, ' ')}
                                </StatusBadge>
                              </div>
                              {rndNext ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-[11px] px-2"
                                  onClick={() => handleUpdateRndStage(sample, rndNext)}
                                >
                                  {rndNext === 'in_progress' ? 'Start work' : 'Mark completed'}
                                </Button>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                              {next ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={() => handleUpdateSampleStatus(sample, next)}
                                >
                                  {next === 'in_preparation' ? 'Mark In Preparation' : 'Mark Sent to Client'}
                                </Button>
                              ) : null}

                              {sample.status === 'sent' ? (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => handleUpdateSampleStatus(sample, 'approved')}
                                  >
                                    Client Approved
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      setRejectingSampleId(sample.id)
                                      setSampleRejectionReason('')
                                    }}
                                  >
                                    Client Rejected
                                  </Button>
                                </>
                              ) : null}
                            </div>

                            {isRejecting ? (
                              <div className="space-y-2 pt-2 border-t">
                                <Input
                                  placeholder="Reason for client sample rejection..."
                                  value={sampleRejectionReason}
                                  onChange={(e) => setSampleRejectionReason(e.target.value)}
                                  className="h-8 text-xs"
                                />
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-7 text-xs"
                                    disabled={!sampleRejectionReason.trim()}
                                    onClick={() => {
                                      handleUpdateSampleStatus(sample, 'rejected', sampleRejectionReason.trim())
                                      setRejectingSampleId(null)
                                    }}
                                  >
                                    Confirm Reject
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setRejectingSampleId(null)}>
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : null}

                            {sample.status === 'rejected' && sample.rejection_reason ? (
                              <div className="text-destructive font-medium pt-1">
                                Rejection feedback: {sample.rejection_reason}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}

                      {samples[0]?.status === 'rejected' ? (
                        <Button size="sm" variant="outline" className="w-full text-xs" onClick={handleRequestSample} disabled={requestingSample}>
                          + Request Follow-up Re-Sample
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Add Product Line Dialog */}
        <Dialog open={addLineOpen} onOpenChange={setAddLineOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-primary" />
                Add Product Line to Order
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1">
                <Label>Select Catalog Formulation *</Label>
                <Select value={newLineProductId} onValueChange={setNewLineProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogProducts.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title} {p.sku ? `(${p.sku})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Variant / Size Name</Label>
                  <Input
                    value={newLineVariant}
                    onChange={(e) => setNewLineVariant(e.target.value)}
                    placeholder="Standard"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Client Brand Name</Label>
                  <Input
                    value={newLineBrand}
                    onChange={(e) => setNewLineBrand(e.target.value)}
                    placeholder={customer?.displayName || 'Brand'}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Pack Size</Label>
                  <Input
                    value={newLinePackSize}
                    onChange={(e) => setNewLinePackSize(e.target.value)}
                    placeholder="50"
                  />
                </div>
                <div className="space-y-1">
                  <Label>UOM</Label>
                  <Select value={newLineUom} onValueChange={setNewLineUom}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UOM_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Order Qty (Units) *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newLineQty}
                    onChange={(e) => setNewLineQty(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Rate / Unit (₹) *</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newLineRate}
                    onChange={(e) => setNewLineRate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>GST %</Label>
                  <Select value={newLineGst} onValueChange={setNewLineGst}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Declared MRP (₹)</Label>
                <Input
                  type="number"
                  min={0}
                  value={newLineMrp}
                  onChange={(e) => setNewLineMrp(e.target.value)}
                  placeholder="499"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddLineOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddLineSubmit} disabled={savingLine || !newLineProductId}>
                {savingLine ? 'Adding...' : 'Add to Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ========================================================= */}
        {/* PROFORMA INVOICE PRINT PREVIEW — same window.print() pattern as */}
        {/* the BOM module's PDF Sheet: no PDF library, browser print/save */}
        {/* ========================================================= */}
        <Dialog open={proformaOpen} onOpenChange={setProformaOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto print:p-0 print:max-w-full">
            <DialogHeader className="print:hidden">
              <DialogTitle className="flex items-center justify-between">
                <span>Proforma Invoice Preview</span>
                <Button size="sm" onClick={() => window.print()} className="gap-1.5 font-bold">
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print / Save as PDF</span>
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="bg-white text-slate-900 p-8 rounded-lg border shadow-xs space-y-6 font-sans text-xs print:border-none print:shadow-none">
              {/* Letterhead */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">DERMAT INDIA</h2>
                  <p className="text-[11px] text-slate-700 leading-tight">Plot No. 696, Pace City-2, Sector 37, GRG KD</p>
                  <p className="text-[11px] text-slate-700 leading-tight">Gurugram, Haryana 122004</p>
                  <p className="text-[11px] text-slate-900 font-mono font-semibold pt-1">GSTIN: 06AAPFD7375J1ZV</p>
                </div>
                <div className="text-right space-y-1">
                  <h3 className="text-base font-extrabold text-primary tracking-wide">PROFORMA INVOICE</h3>
                  <div className="text-[11px] text-slate-700">
                    <div><span className="font-semibold">Invoice #:</span> {proformaNumber || `PI-${order.orderNumber}`}</div>
                    <div><span className="font-semibold">Order #:</span> {order.orderNumber}</div>
                    <div><span className="font-semibold">Date:</span> {formatDate(order.placedAt || order.createdAt)}</div>
                    {order.expectedDeliveryAt ? (
                      <div><span className="font-semibold">Delivery by:</span> {formatDate(order.expectedDeliveryAt)}</div>
                    ) : null}
                    {customerPoRef ? <div><span className="font-semibold">Customer PO:</span> {customerPoRef}</div> : null}
                  </div>
                </div>
              </div>

              {/* Bill To */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bill To</p>
                  <p className="font-bold text-slate-900">{customer?.displayName || order.customerSnapshot?.customer?.displayName || 'Unnamed Customer'}</p>
                  {customer?.address ? <p className="text-[11px] text-slate-700">{customer.address}</p> : null}
                  {customer?.gstin ? <p className="text-[11px] text-slate-900 font-mono">GSTIN: {customer.gstin}</p> : null}
                  {customer?.phone ? <p className="text-[11px] text-slate-700">Phone: {customer.phone}</p> : null}
                  {customer?.email ? <p className="text-[11px] text-slate-700">Email: {customer.email}</p> : null}
                </div>
                <div className="text-right space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Payment Terms</p>
                  <p className="text-[11px] text-slate-700">
                    {advanceAmount > 0
                      ? `Advance received: ${formatINR(advanceAmount)}${advanceDate ? ` on ${formatDate(advanceDate)}` : ''}`
                      : 'Advance payment as agreed'}
                  </p>
                  <p className="text-[11px] text-slate-700">Balance due before dispatch</p>
                </div>
              </div>

              {/* Line items — table-fixed with explicit column widths so a long
                  product name wraps instead of stretching the table past the
                  dialog/print page width. */}
              <div className="overflow-x-auto">
              <table className="w-full table-fixed text-[11px] text-left border-collapse border border-slate-300">
                <colgroup>
                  <col className="w-8" />
                  <col />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead className="bg-primary text-primary-foreground font-bold">
                  <tr>
                    <th className="p-1.5 border border-slate-300 text-center">#</th>
                    <th className="p-1.5 border border-slate-300">Product</th>
                    <th className="p-1.5 border border-slate-300 text-center">Pack</th>
                    <th className="p-1.5 border border-slate-300 text-right">Qty</th>
                    <th className="p-1.5 border border-slate-300 text-right">Rate (₹)</th>
                    <th className="p-1.5 border border-slate-300 text-right">Taxable (₹)</th>
                    <th className="p-1.5 border border-slate-300 text-right">GST %</th>
                    <th className="p-1.5 border border-slate-300 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400">No line items on this order.</td>
                    </tr>
                  ) : (
                    lines.map((line, idx) => {
                      const qty = Number(line.quantity) || 0
                      const rate = Number(line.unit_price_net) || 0
                      const taxRate = Number(line.tax_rate) || 0
                      const taxable = qty * rate
                      const total = taxable * (1 + taxRate / 100)
                      return (
                        <tr key={line.id}>
                          <td className="p-1.5 border border-slate-200 text-center font-semibold">{idx + 1}</td>
                          <td className="p-1.5 border border-slate-200 break-words">
                            <div className="font-bold text-slate-900">{line.name || 'Item'}</div>
                            {line.cf_brand_name ? <div className="text-[10px] text-slate-600">{line.cf_brand_name}</div> : null}
                          </td>
                          <td className="p-1.5 border border-slate-200 text-center break-words">
                            {line.cf_pack_size ? `${line.cf_pack_size} ${line.cf_uom || ''}`.trim() : '—'}
                          </td>
                          <td className="p-1.5 border border-slate-200 text-right font-mono">{qty.toLocaleString('en-IN')}</td>
                          <td className="p-1.5 border border-slate-200 text-right font-mono">{rate.toFixed(2)}</td>
                          <td className="p-1.5 border border-slate-200 text-right font-mono">{taxable.toFixed(2)}</td>
                          <td className="p-1.5 border border-slate-200 text-right font-mono">{taxRate}%</td>
                          <td className="p-1.5 border border-slate-200 text-right font-mono font-bold">{total.toFixed(2)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Taxable Subtotal</span>
                    <span className="font-mono text-slate-900">{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total GST</span>
                    <span className="font-mono text-slate-900">{formatINR(totalTax)}</span>
                  </div>
                  {advanceAmount > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Less: Advance Received</span>
                      <span className="font-mono text-slate-900">-{formatINR(advanceAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-extrabold">
                    <span className="text-slate-900">
                      {advanceAmount > 0 ? 'Balance Due' : 'Grand Total'}
                    </span>
                    <span className="font-mono text-primary">
                      {formatINR(Math.max(0, grandTotal - advanceAmount))}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-slate-500 border-t border-slate-200 pt-3">
                This is a proforma invoice for reference purposes only and does not constitute a tax invoice.
                Prices and taxes are estimates and may be revised at the time of final dispatch.
              </p>
            </div>

            <DialogFooter className="print:hidden">
              <Button variant="outline" size="sm" onClick={() => setProformaOpen(false)}>
                Close
              </Button>
              <Button size="sm" onClick={() => window.print()} className="gap-1.5 font-bold">
                <Printer className="h-3.5 w-3.5" />
                <span>Print / Save as PDF</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
