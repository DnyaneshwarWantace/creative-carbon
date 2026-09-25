'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { ComboboxInput, type ComboboxOption } from '@open-mercato/ui/backend/inputs/ComboboxInput'
import { fetchAssignableStaffMembers } from '@open-mercato/core/modules/customers/lib/assignableStaff'
import { CreateCompanyPanel, type CreatedCompany } from '@open-mercato/core/modules/customers/components/CreateCompanyPanel'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { StepIndicator, type StepIndicatorStep } from '@open-mercato/ui/primitives/step-indicator'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { CheckboxField } from '@open-mercato/ui/primitives/checkbox-field'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@open-mercato/ui/primitives/select'
import {
  Trash2,
  Plus,
  Building2,
  Package,
  PackageCheck,
  Boxes,
  CheckCircle2,
  ShoppingBag,
  Sparkles,
  Calendar,
  Layers,
  FlaskConical,
  ArrowRight,
  ArrowLeft,
  Search,
  Copy,
  HelpCircle,
  FileText,
  CreditCard,
  Binoculars,
  X,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'

// Fallback options used only while the live dictionary fetch is loading or if it
// fails — mirrors the pre-dictionary defaults so the wizard degrades gracefully
// instead of rendering an empty dropdown. Editable via Settings > Dictionaries
// (keys: unit [shared with catalog], category, packaging_type) once loaded.
const UOM_FALLBACK_OPTIONS = [
  { value: 'ml', label: 'ml (Milliliter)' },
  { value: 'gm', label: 'gm (Gram)' },
  { value: 'kg', label: 'kg (Kilogram)' },
  { value: 'l', label: 'L (Liter)' },
  { value: 'pcs', label: 'pcs (Pieces)' },
] as const

const CATEGORY_FALLBACK_OPTIONS = [
  { value: 'Serum', label: 'Face Serum' },
  { value: 'Cream', label: 'Face Cream / Moisturizer' },
  { value: 'Lotion', label: 'Body Lotion / Milk' },
  { value: 'Gel', label: 'Treatment Gel / Salicylic' },
  { value: 'Face Wash', label: 'Cleanser / Face Wash' },
  { value: 'Sunscreen', label: 'Sunscreen Gel / Lotion SPF' },
  { value: 'Toner', label: 'Facial Toner / Mist' },
  { value: 'Shampoo', label: 'Hair Care / Shampoo / Conditioner' },
  { value: 'Mask', label: 'Face Mask / Peeling Solution' },
  { value: 'Oil', label: 'Face / Hair Oil' },
] as const

// Fixed Indian GST slabs — a law-defined constant, not Dermat business data, so it
// intentionally stays hardcoded (not moved to a Dictionaries-module entry).
const GST_RATES = [
  { value: '0', label: '0% (Exempt)' },
  { value: '5', label: '5% GST' },
  { value: '12', label: '12% GST' },
  { value: '18', label: '18% GST (Cosmetics)' },
  { value: '28', label: '28% GST' },
] as const

const PACKAGING_TYPE_FALLBACK_OPTIONS = [
  { value: 'Bottle', label: 'Bottle (Dropper / Pump / Flip-top)' },
  { value: 'Jar', label: 'Jar (Glass / Acrylic / PP)' },
  { value: 'Tube', label: 'Tube (Lami / Aluminum / Plastic)' },
  { value: 'Dropper', label: 'Glass Dropper Bottle' },
  { value: 'Pump', label: 'Airless Pump Bottle' },
  { value: 'Sachet', label: 'Sachet / Single Use' },
  { value: 'Custom', label: 'Custom Packaging' },
] as const

type DictionaryOption = { value: string; label: string }

type DictionaryEntryPayload = { value?: string; label?: string }
type DictionaryResponsePayload = { entries?: DictionaryEntryPayload[] }

function buildDictionaryOptions(
  entries: DictionaryEntryPayload[] | undefined,
  fallback: readonly DictionaryOption[],
): DictionaryOption[] {
  const list = Array.isArray(entries) ? entries : []
  const options = list
    .map((entry) => {
      const value = typeof entry.value === 'string' ? entry.value.trim() : ''
      if (!value) return null
      return { value, label: (typeof entry.label === 'string' && entry.label.trim()) || value }
    })
    .filter((entry): entry is DictionaryOption => Boolean(entry))
  return options.length > 0 ? options : [...fallback]
}

const formatOptionLabel = (val: string): string => {
  const map: Record<string, string> = {
    unregistered: 'Unregistered',
    registered: 'Registered Regular',
    composition: 'Composition Scheme',
    overseas: 'Overseas / SEZ',
    due_on_delivery: 'Due on Delivery',
    '15_days': '15 Days',
    '30_days': '30 Days',
    '45_days': '45 Days',
    '60_days': '60 Days',
    '90_days': '90 Days',
    business: 'Business (B2B)',
    individual: 'Individual (B2C)',
  }
  return map[val] || val
}

type CustomerRow = {
  id: string
  displayName: string
  legalName?: string | null
  phone: string | null
  gstin: string | null
  salesPoc: string | null
  email?: string | null
  address?: string | null
  paymentTerms?: string | null
  paymentRemarks?: string | null
  gstRegistrationType?: string | null
  customerTypeCategory?: string | null
  customFields?: Record<string, unknown>
}

type CatalogProductItem = {
  id: string
  title: string
  sku?: string | null
  category?: string | null
  baseUom?: string | null
  customerId?: string | null
  customerName?: string | null
  clientBrand?: string | null
  minFloorQty?: number | null
  itemType?: string | null
}

type WizardStepId = 'customer' | 'lines' | 'details' | 'review'

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'customer', label: '1. Customer & Header' },
  { id: 'lines', label: '2. Products & Items' },
  { id: 'details', label: '3. Packaging & R&D' },
  { id: 'review', label: '4. Review & Book' },
]

type OrderLineDraft = {
  key: string
  productId: string
  productLabel: string
  productCode?: string
  category: string
  variantSku: string
  brandName: string
  packSize: string
  uom: string
  quantity: string
  batchNo: string
  unitPrice: string
  rate: string
  gstPercent: string
  mrp: string
}

function makeEmptyLine(): OrderLineDraft {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random().toString(36).slice(2)}`,
    productId: '',
    productLabel: '',
    productCode: '',
    category: 'Serum',
    variantSku: 'Standard',
    brandName: '',
    packSize: '',
    uom: 'ml',
    quantity: '',
    batchNo: '',
    unitPrice: '',
    rate: '',
    gstPercent: '18',
    mrp: '',
  }
}

function calcLineSubtotal(line: OrderLineDraft): number {
  const qty = Number(line.quantity) || 0
  const rate = Number(line.rate) || 0
  return Math.max(qty * rate, 0)
}

function calcLineTax(line: OrderLineDraft): number {
  const sub = calcLineSubtotal(line)
  const gst = Number(line.gstPercent) || 0
  return (sub * gst) / 100
}

function calcLineTotal(line: OrderLineDraft): number {
  return calcLineSubtotal(line) + calcLineTax(line)
}

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount)
}

export default function CreateOrderPage() {
  const t = useT()
  const router = useRouter()
  const { organizationId, tenantId } = useOrganizationScopeDetail()

  const [activeStep, setActiveStep] = React.useState<WizardStepId>('customer')

  // Step 1: Customer state
  const [search, setSearch] = React.useState('')
  const [customerRows, setCustomerRows] = React.useState<CustomerRow[]>([])
  const [loadingCustomers, setLoadingCustomers] = React.useState(false)
  const [selectedCustomer, setSelectedCustomer] = React.useState<CustomerRow | null>(null)

  // Step 1: "Create New Customer" slide-over panel — reuses the same CrudForm
  // config as the standalone Companies create page (packages/core), instead of
  // a hand-rolled inline form.
  const [createCustomerPanelOpen, setCreateCustomerPanelOpen] = React.useState(false)

  // Step 1: Commercial Header state
  const [nextOrderNumber, setNextOrderNumber] = React.useState<string | null>(null)
  const [orderDate, setOrderDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [deliveryDate, setDeliveryDate] = React.useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 30)
    return d.toISOString().slice(0, 10)
  })
  const [orderType, setOrderType] = React.useState<'New' | 'Repeat' | 'Revision'>('New')
  const [priority, setPriority] = React.useState<'Normal' | 'High' | 'Urgent'>('Normal')
  const [salesPoc, setSalesPoc] = React.useState('')

  // Step 2: Order Lines state
  const [lines, setLines] = React.useState<OrderLineDraft[]>([makeEmptyLine()])

  // Catalog products cache for line selection
  const [catalogProducts, setCatalogProducts] = React.useState<CatalogProductItem[]>([])
  const [loadingCatalog, setLoadingCatalog] = React.useState(false)

  // Inline Product / Variation panel state — a line's panel is expanded directly
  const [selectedExistingProdId, setSelectedExistingProdId] = React.useState<string>('')
  // Compact variant picker: only shown inline next to the search combobox when the
  // selected product genuinely has 2+ variants. A single (or zero) variant is
  // auto-applied to the line immediately, no picker shown at all.
  const [variantPickerLineKey, setVariantPickerLineKey] = React.useState<string | null>(null)
  // Lines whose selected product has exactly 0/1 variants — these render a plain
  // editable pack-size input (pre-filled from the single variant, still editable)
  // instead of the multi-variant dropdown, so the variant field is never silently
  // invisible even when there is nothing to "choose" between.
  const [singleVariantLineKeys, setSingleVariantLineKeys] = React.useState<Set<string>>(new Set())
  // Multi-select: lets the user attach several variations (e.g. 30ml + 50ml) of the
  // same product to the order in one go, one order line per selected variation.
  const [selectedVariantIds, setSelectedVariantIds] = React.useState<string[]>([])
  // True while the inline "add a new variation" table row is open for editing.
  const [addingNewVariantRow, setAddingNewVariantRow] = React.useState(false)
  const [savingNewVariantRow, setSavingNewVariantRow] = React.useState(false)
  const [existingVariants, setExistingVariants] = React.useState<
    Array<{ id: string; name: string; sku?: string | null; packSize?: string; uom?: string; mrp?: string; rate?: string | null; gstPercent?: string; gstTaxCategory?: string; shelfLife?: string; isDefault?: boolean }>
  >([])
  const [loadingVariants, setLoadingVariants] = React.useState(false)

  // Slide-over Create Product Panel state
  // Catalog Product Search Modal state
  const [catalogSearchOpen, setCatalogSearchOpen] = React.useState(false)
  const [catalogSearchLineKey, setCatalogSearchLineKey] = React.useState<string | null>(null)
  const [catalogSearchQuery, setCatalogSearchQuery] = React.useState('')

  // Section 1: Basic Product Information
  const [newProdTitle, setNewProdTitle] = React.useState('')
  const [newProdCode, setNewProdCode] = React.useState('')
  const [newProdCategory, setNewProdCategory] = React.useState('Serum')
  const [newProdGstTaxCategory, setNewProdGstTaxCategory] = React.useState('18% GST Cosmetics')
  const [newProdMinFloorQty, setNewProdMinFloorQty] = React.useState('500')
  const [newProdBaseUom, setNewProdBaseUom] = React.useState('ml')
  const [newProdDescription, setNewProdDescription] = React.useState('')

  // Section 2: Variant Details
  const [newProdVariantName, setNewProdVariantName] = React.useState('Standard')
  const [newProdPackSize, setNewProdPackSize] = React.useState('50')
  const [newProdUom, setNewProdUom] = React.useState('ml')
  const [newProdMrp, setNewProdMrp] = React.useState('599')
  const [newProdShelfLife, setNewProdShelfLife] = React.useState('24 Months')

  // Section 3: Commercial Order Terms
  const [newProdQuantity, setNewProdQuantity] = React.useState('500')
  const [newProdRate, setNewProdRate] = React.useState('180')
  const [newProdGstPercent, setNewProdGstPercent] = React.useState('18')

  const [creatingProduct, setCreatingProduct] = React.useState(false)

  // Step 3: Packaging & R&D state
  const [packagingType, setPackagingType] = React.useState('Bottle')
  const [pmSource, setPmSource] = React.useState<'dermat' | 'client'>('dermat')
  const [artworkRequirement, setArtworkRequirement] = React.useState<'client' | 'in_house' | 'approved'>('client')
  const [orderNotes, setOrderNotes] = React.useState('')

  // Step 3: Payment (spec §4.1 step 3 / §4.3 Advance Required, Advance %, Advance Amount,
  // Advance Received Date — declared in ce.ts but never surfaced in this wizard until now).
  // The Kanban's advance-payment gate (New -> Verified/Official) reads `advance_required` /
  // `advance_percent` set here to decide whether it must prompt for advance confirmation.
  const [advanceRequired, setAdvanceRequired] = React.useState(true)
  const [advancePercent, setAdvancePercent] = React.useState('40')
  const [advanceAmount, setAdvanceAmount] = React.useState('')
  const [advanceReceivedNow, setAdvanceReceivedNow] = React.useState(false)
  const [advanceReceivedDate, setAdvanceReceivedDate] = React.useState('')
  const [paymentRef, setPaymentRef] = React.useState('')

  // Submission state
  const [submitting, setSubmitting] = React.useState(false)

  // Dictionary-backed option lists (UOM, Category, Packaging Type) — admin-editable
  // via Settings > Dictionaries instead of frozen in code. UOM reuses the shared
  // `unit` dictionary catalog's ProductUomSection already fetches from; Category and
  // Packaging Type are Dermat-specific dictionaries seeded by this module's setup.
  const [uomOptions, setUomOptions] = React.useState<DictionaryOption[]>([...UOM_FALLBACK_OPTIONS])
  const [categoryOptions, setCategoryOptions] = React.useState<DictionaryOption[]>([...CATEGORY_FALLBACK_OPTIONS])
  const [packagingTypeOptions, setPackagingTypeOptions] = React.useState<DictionaryOption[]>([...PACKAGING_TYPE_FALLBACK_OPTIONS])

  React.useEffect(() => {
    let cancelled = false
    async function loadDictionaryOptions() {
      const [unitRes, categoryRes, packagingRes] = await Promise.all([
        apiCall<DictionaryResponsePayload>('/api/catalog/dictionaries/unit', undefined, { fallback: { entries: [] } }),
        apiCall<DictionaryResponsePayload>('/api/dermat_sales_flow/dictionaries/category', undefined, { fallback: { entries: [] } }),
        apiCall<DictionaryResponsePayload>('/api/dermat_sales_flow/dictionaries/packaging_type', undefined, { fallback: { entries: [] } }),
      ])
      if (cancelled) return
      setUomOptions(buildDictionaryOptions(unitRes.result?.entries, UOM_FALLBACK_OPTIONS))
      setCategoryOptions(buildDictionaryOptions(categoryRes.result?.entries, CATEGORY_FALLBACK_OPTIONS))
      setPackagingTypeOptions(buildDictionaryOptions(packagingRes.result?.entries, PACKAGING_TYPE_FALLBACK_OPTIONS))
    }
    void loadDictionaryOptions()
    return () => { cancelled = true }
  }, [])

  // Load existing customers
  const loadCustomers = React.useCallback(async (query: string) => {
    setLoadingCustomers(true)
    try {
      const params = new URLSearchParams()
      params.set('pageSize', '50')
      if (query) params.set('search', query)
      const call = await apiCall<{
        items: Array<{
          id: string
          display_name?: string
          legal_name?: string | null
          primary_phone?: string | null
          primary_email?: string | null
          cf_gstin?: string | null
          cf_sales_manager?: string | null
          cf_address?: string | null
          cf_payment_terms?: string | null
          cf_payment_remarks?: string | null
          cf_legal_trade_name?: string | null
          cf_gst_registration_type?: string | null
          cf_customer_type_category?: string | null
          [key: string]: unknown
        }>
      }>(
        `/api/customers/companies?${params.toString()}`
      )
      const items = call.ok ? call.result?.items ?? [] : []
      setCustomerRows(
        items.map((item) => {
          const cf: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(item)) {
            if (k.startsWith('cf_')) {
              cf[k.slice(3)] = v
            }
          }
          return {
            id: item.id,
            displayName: item.display_name ?? 'Unnamed Company',
            legalName: (item.cf_legal_trade_name as string) || (item.legal_name as string) || null,
            phone: item.primary_phone ?? null,
            email: item.primary_email ?? null,
            gstin: (item.cf_gstin as string) ?? null,
            salesPoc: (item.cf_sales_manager as string) ?? null,
            address: (item.cf_address as string) ?? null,
            paymentTerms: (item.cf_payment_terms as string) ?? null,
            paymentRemarks: (item.cf_payment_remarks as string) ?? null,
            gstRegistrationType: (item.cf_gst_registration_type as string) ?? null,
            customerTypeCategory: (item.cf_customer_type_category as string) ?? null,
            customFields: cf,
          }
        })
      )
    } finally {
      setLoadingCustomers(false)
    }
  }, [])

  React.useEffect(() => {
    const handle = setTimeout(() => loadCustomers(search), 250)
    return () => clearTimeout(handle)
  }, [search, loadCustomers])

  // Preview the auto-generated Sales Order # up front, matching the real system's
  // header layout (order number shown first, read-only, with a Change Sequence
  // link) — does not claim/increment the sequence, purely a preview.
  React.useEffect(() => {
    let cancelled = false
    apiCall<{ nextOrderNumber: string }>('/api/dermat_sales_flow/orders/next-number').then((call) => {
      if (!cancelled && call.ok && call.result?.nextOrderNumber) {
        setNextOrderNumber(call.result.nextOrderNumber)
      }
    })
    return () => { cancelled = true }
  }, [])

  // Load catalog products for line picker
  React.useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true)
      try {
        const call = await apiCall<{ items: Array<any> }>(
          '/api/catalog/products?pageSize=100'
        )
        if (call.ok && Array.isArray(call.result?.items)) {
          setCatalogProducts(
            call.result.items.map((p: any) => {
              const meta = (p.metadata || {}) as Record<string, any>
              const cf = (p.customFields || {}) as Record<string, any>
              return {
                id: p.id,
                title: p.title || p.name || 'Unnamed Product',
                sku: p.sku || cf.product_code || meta.product_code || null,
                category: cf.category || meta.category || 'Serum',
                baseUom: cf.base_uom || meta.base_uom || p.default_unit || 'ml',
                customerId: cf.customer || cf.customer_id || cf.company || meta.customer_id || null,
                customerName: cf.customer_name || meta.customer_name || meta.customer || null,
                clientBrand: cf.client_brand || meta.client_brand || meta.customer || meta.brand_name || null,
                minFloorQty: cf.min_floor_qty || meta.min_floor_qty || null,
                itemType: meta.item_type || cf.item_type || null,
              }
            })
          )
        }
      } catch (e) {
        console.error('Failed to load catalog products', e)
      } finally {
        setLoadingCatalog(false)
      }
    }
    loadCatalog()
  }, [])

  // Customer Product Filtering & Matching
  const isProductForCustomer = React.useCallback(
    (p: CatalogProductItem, cust: CustomerRow | null) => {
      if (!cust) return true
      if (p.customerId && p.customerId === cust.id) return true
      const normCust = cust.displayName.trim().toLowerCase()
      if (p.customerName && (p.customerName.toLowerCase().includes(normCust) || normCust.includes(p.customerName.toLowerCase()))) return true
      if (p.clientBrand && (p.clientBrand.toLowerCase().includes(normCust) || normCust.includes(p.clientBrand.toLowerCase()))) return true
      if (p.title && p.title.toLowerCase().includes(normCust)) return true
      return false
    },
    []
  )

  const customerMatchingProducts = React.useMemo(() => {
    if (!selectedCustomer) return catalogProducts
    return catalogProducts.filter((p) => isProductForCustomer(p, selectedCustomer))
  }, [catalogProducts, selectedCustomer, isProductForCustomer])

  const otherCatalogProducts = React.useMemo(() => {
    if (!selectedCustomer) return []
    return catalogProducts.filter((p) => !isProductForCustomer(p, selectedCustomer))
  }, [catalogProducts, selectedCustomer, isProductForCustomer])

  // Product options for the line-level search combobox: code shown first/most
  // prominently (client requirement — orders are placed by code), title as the
  // description line, matching on both code and title, customer-linked products
  // ranked first.
  const productComboboxOptions = React.useMemo((): ComboboxOption[] => {
    const ranked = [...customerMatchingProducts, ...otherCatalogProducts]
    return ranked.map((p) => ({
      value: p.id,
      label: p.sku ? `${p.sku} — ${p.title}` : p.title,
      description: p.category || null,
    }))
  }, [customerMatchingProducts, otherCatalogProducts])

  const loadProductSuggestionsForLine = React.useCallback(
    async (query?: string): Promise<ComboboxOption[]> => {
      const q = (query || '').trim().toLowerCase()
      if (!q) return productComboboxOptions
      const ranked = [...customerMatchingProducts, ...otherCatalogProducts]
      return ranked
        .filter((p) => (p.sku && p.sku.toLowerCase().includes(q)) || p.title.toLowerCase().includes(q))
        .map((p) => ({
          value: p.id,
          label: p.sku ? `${p.sku} — ${p.title}` : p.title,
          description: p.category || null,
        }))
    },
    [customerMatchingProducts, otherCatalogProducts, productComboboxOptions]
  )

  const filteredCatalogProducts = React.useMemo(() => {
    const q = catalogSearchQuery.trim().toLowerCase()
    const list = [...customerMatchingProducts, ...otherCatalogProducts]
    if (!q) return list
    return list.filter(
      (p) =>
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        p.title.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.clientBrand && p.clientBrand.toLowerCase().includes(q))
    )
  }, [customerMatchingProducts, otherCatalogProducts, catalogSearchQuery])

  // Sales POC / Executive — searches the real assignable-staff roster instead of
  // letting a free-text field drift (typos, ex-employees, names that aren't on
  // the sales team). Stores the staff member's display name, matching the
  // existing free-text `salesPoc` shape already used across this file and on
  // customer records (`cf_sales_poc`).
  const loadSalesPocSuggestions = React.useCallback(async (query?: string): Promise<ComboboxOption[]> => {
    const staff = await fetchAssignableStaffMembers(query || '', { pageSize: 20 })
    return staff.map((member) => ({
      value: member.displayName,
      label: member.displayName,
      description: member.teamName || member.email || null,
    }))
  }, [])

  // Automatically keep brand name synced and auto-select product for new empty order line when customer is selected
  React.useEffect(() => {
    if (!selectedCustomer) return
    setLines((prev) => {
      const match = catalogProducts.filter((p) => isProductForCustomer(p, selectedCustomer))
      return prev.map((l, idx) => {
        const brand = selectedCustomer.displayName
        if (idx === 0 && !l.productId && match.length > 0) {
          const p = match[0]
          return {
            ...l,
            productId: p.id,
            productLabel: p.title,
            productCode: p.sku || '',
            category: p.category || 'Serum',
            uom: p.baseUom || 'ml',
            brandName: p.clientBrand || brand,
            variantSku: 'Standard',
          }
        }
        return {
          ...l,
          brandName: l.brandName || brand,
        }
      })
    })
  }, [selectedCustomer, catalogProducts, isProductForCustomer])

  // Called by the CreateCompanyPanel slide-over on successful creation — mirrors
  // the state wiring the old hand-rolled inline form used to do on success
  // (select the new customer, prepend it to the rows list, auto-fill Sales POC
  // when empty), just sourced from the real CrudForm's CompanyFormValues shape
  // instead of ad hoc local state.
  const handleCustomerCreated = React.useCallback((company: CreatedCompany) => {
    const customFields = company.customFields ?? {}
    const gstin = typeof customFields.gstin === 'string' ? customFields.gstin : null
    const companySalesPoc = typeof customFields.sales_manager === 'string' ? customFields.sales_manager : null
    const paymentTerms = typeof customFields.payment_terms === 'string' ? customFields.payment_terms : null
    const paymentRemarks = typeof customFields.payment_remarks === 'string' ? customFields.payment_remarks : null
    const legalName = typeof customFields.legal_trade_name === 'string' ? customFields.legal_trade_name : null
    const gstType = typeof customFields.gst_registration_type === 'string' ? customFields.gst_registration_type : null
    const cust: CustomerRow = {
      id: company.id,
      displayName: company.displayName,
      legalName,
      phone: company.primaryPhone ?? null,
      email: company.primaryEmail ?? null,
      gstin,
      salesPoc: companySalesPoc,
      address: company.addressLine1 ?? null,
      paymentTerms,
      paymentRemarks,
      gstRegistrationType: gstType,
      customerTypeCategory: typeof customFields.customer_type_category === 'string' ? customFields.customer_type_category : null,
      customFields,
    }
    setCustomerRows((prev) => [cust, ...prev.filter((c) => c.id !== company.id)])
    setSelectedCustomer(cust)
    if (companySalesPoc && !salesPoc) setSalesPoc(companySalesPoc)

    if (paymentRemarks) {
      const match = paymentRemarks.match(/(\d+)%\s*advance/i)
      if (match && match[1]) {
        setAdvanceRequired(true)
        setAdvancePercent(match[1])
      }
    }
  }, [salesPoc])

  // Helper   // Load variants for a selected existing product. Returns the mapped
  // variants so callers can decide whether to auto-apply the single result or show
  // the compact multi-variant picker, in addition to the existing side effects
  // (populating existingVariants / selectedVariantIds / the newProd* form fields).
  const loadVariantsForProduct = React.useCallback(async (prodId: string) => {
    if (!prodId) {
      setExistingVariants([])
      return []
    }
    setLoadingVariants(true)
    try {
      const res = await apiCall<{ items?: Array<any> }>(
        `/api/catalog/variants?productId=${encodeURIComponent(prodId)}&pageSize=50`
      )
      if (res.ok && res.result?.items && res.result.items.length > 0) {
        const mapped = res.result.items.map((v: any) => ({
          id: v.id,
          name: v.name || 'Standard',
          sku: v.sku || null,
          packSize: String(v.metadata?.pack_size || v.customFields?.pack_size || v.weightValue || '50'),
          uom: v.metadata?.uom || v.weightUnit || v.customFields?.uom || 'ml',
          mrp: String(v.metadata?.mrp || v.customFields?.mrp || '599'),
          rate: v.metadata?.rate ? String(v.metadata.rate) : (v.customFields?.rate ? String(v.customFields.rate) : null),
          gstPercent: String(v.metadata?.gst_percent || v.customFields?.gst_percent || '18'),
          gstTaxCategory: v.metadata?.gst_tax_category || v.customFields?.gst_tax_category || '18% GST Cosmetics',
          shelfLife: v.metadata?.shelf_life || v.customFields?.shelf_life || '24 Months',
          isDefault: Boolean(v.isDefault || v.is_default),
        }))
        setExistingVariants(mapped)
        if (mapped[0]) {
          setSelectedVariantIds([mapped[0].id])
          setNewProdVariantName(mapped[0].name)
          setNewProdPackSize(mapped[0].packSize || '50')
          setNewProdUom(mapped[0].uom || 'ml')
          setNewProdMrp(mapped[0].mrp || '599')
          if (mapped[0].rate) setNewProdRate(mapped[0].rate)
          if (mapped[0].gstPercent) setNewProdGstPercent(mapped[0].gstPercent)
          if (mapped[0].shelfLife) setNewProdShelfLife(mapped[0].shelfLife)
        } else {
          setSelectedVariantIds([])
        }
        return mapped
      } else {
        const fallback = [{ id: 'Standard', name: 'Standard (50ml)', packSize: '50', uom: 'ml', mrp: '599', gstPercent: '18', shelfLife: '24 Months' }]
        setExistingVariants(fallback)
        setSelectedVariantIds(['Standard'])
        return fallback
      }
    } catch {
      const fallback = [{ id: 'Standard', name: 'Standard (50ml)', packSize: '50', uom: 'ml', mrp: '599', gstPercent: '18', shelfLife: '24 Months' }]
      setExistingVariants(fallback)
      setSelectedVariantIds(['Standard'])
      return fallback
    } finally {
      setLoadingVariants(false)
    }
  }, [])

  // Open the inline "add a new variation" table row, starting from blank fields
  // (not a pre-filled clone of whichever variant was last clicked).
  const startAddingNewVariantRow = React.useCallback(() => {
    setNewProdVariantName('')
    setNewProdPackSize('')
    setNewProdUom('ml')
    setNewProdMrp('')
    setNewProdRate('')
    setNewProdGstPercent('18')
    setNewProdShelfLife('')
    setAddingNewVariantRow(true)
  }, [])

  // Save the inline "add a new variation" row immediately: creates the variant via
  // the API right away, adds it to the variation table pre-selected, and closes the
  // row — no separate outer "confirm" step needed for this part.
  const handleSaveNewVariantRow = React.useCallback(async () => {
    if (!selectedExistingProdId) {
      flash('Select a product first', 'error')
      return
    }
    if (!newProdPackSize.trim()) {
      flash('Pack Size is required', 'error')
      return
    }
    setSavingNewVariantRow(true)
    try {
      const mrpNum = Number(newProdMrp)
      const packNum = Number(newProdPackSize)
      const rateNum = Number(newProdRate)
      const variantPayload = {
        organizationId,
        tenantId,
        productId: selectedExistingProdId,
        name: newProdVariantName.trim() || `${newProdPackSize}${newProdUom}`,
        isActive: true,
        weightValue: !Number.isNaN(packNum) ? packNum : undefined,
        weightUnit: newProdUom || undefined,
        metadata: {
          pack_size: newProdPackSize.trim(),
          uom: newProdUom.trim(),
          mrp: newProdMrp.trim(),
          rate: newProdRate.trim(),
          gst_percent: newProdGstPercent.trim() || '18',
          gst_tax_category: newProdGstTaxCategory.trim() || '18% GST Cosmetics',
          shelf_life: newProdShelfLife.trim() || '24 Months',
        },
        customFields: {
          pack_size: newProdPackSize.trim() || undefined,
          uom: newProdUom.trim() || undefined,
          shelf_life: newProdShelfLife.trim() || undefined,
          mrp: !Number.isNaN(mrpNum) ? mrpNum : undefined,
          rate: !Number.isNaN(rateNum) ? rateNum : undefined,
          gst_percent: newProdGstPercent.trim() || '18',
          gst_tax_category: newProdGstTaxCategory.trim() || '18% GST Cosmetics',
        },
      }
      const res = await createCrud<{ id: string }>('catalog/variants', variantPayload)
      const newId = res.result?.id || `local-${Date.now()}`
      const newVariant = {
        id: newId,
        name: newProdVariantName.trim() || `${newProdPackSize}${newProdUom}`,
        packSize: newProdPackSize.trim(),
        uom: newProdUom.trim(),
        mrp: newProdMrp.trim(),
        rate: newProdRate.trim() || null,
        gstPercent: newProdGstPercent.trim() || '18',
        shelfLife: newProdShelfLife.trim() || '24 Months',
        isDefault: false,
      }
      setExistingVariants((prev) => [...prev, newVariant])
      setSelectedVariantIds((prev) => [...prev, newId])
      setAddingNewVariantRow(false)
      flash(`Variation "${newVariant.name}" saved`, 'success')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to save variation', 'error')
    } finally {
      setSavingNewVariantRow(false)
    }
  }, [
    selectedExistingProdId,
    newProdVariantName,
    newProdPackSize,
    newProdUom,
    newProdMrp,
    newProdRate,
    newProdGstPercent,
    newProdGstTaxCategory,
    newProdShelfLife,
    organizationId,
    tenantId,
  ])

  const updateLine = React.useCallback((key: string, patch: Partial<OrderLineDraft>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }, [])

  // Apply one resolved variant's data onto a line — the single shared place both
  // the auto-apply path (0/1 variant) and the compact multi-variant picker call
  // once a variant is known, so a line always ends up with the same fields set
  // regardless of which path picked it.
  const applyVariantToLine = React.useCallback(
    (lineKey: string, product: CatalogProductItem, variant?: { id: string; name: string; packSize?: string; uom?: string; mrp?: string; rate?: string | null; gstPercent?: string }) => {
      updateLine(lineKey, {
        productId: product.id,
        productLabel: product.title,
        productCode: product.sku || '',
        category: product.category || 'Serum',
        variantSku: variant?.name || 'Standard',
        packSize: variant?.packSize || '',
        uom: variant?.uom || product.baseUom || 'ml',
        mrp: variant?.mrp || '',
        rate: variant?.rate || '',
        gstPercent: variant?.gstPercent || '18',
        brandName: product.clientBrand || selectedCustomer?.displayName || '',
      })
    },
    [updateLine, selectedCustomer]
  )

  // Main product-attach entry point for the search combobox: resolves the
  // product's variants and either auto-applies the single (or zero) variant
  // straight onto the line, or opens the compact inline picker when the product
  // genuinely has 2+ variants to choose from.
  const handleSelectProductForLine = React.useCallback(
    async (lineKey: string, productId: string) => {
      const product = catalogProducts.find((p) => p.id === productId)
      if (!product) return
      setVariantPickerLineKey(null)
      setSingleVariantLineKeys((prev) => {
        const next = new Set(prev)
        next.delete(lineKey)
        return next
      })
      const variants = await loadVariantsForProduct(productId)
      if (variants.length <= 1) {
        applyVariantToLine(lineKey, product, variants[0])
        // Still surface an editable pack-size field even though there is only
        // one (or zero) variant — auto-applying the value must not make the
        // field invisible to the user.
        setSingleVariantLineKeys((prev) => new Set(prev).add(lineKey))
      } else {
        // Apply the product identity immediately so the row reflects the pick
        // right away; pack/price stay from the previous line state until a
        // variant is chosen in the dropdown.
        updateLine(lineKey, {
          productId: product.id,
          productLabel: product.title,
          productCode: product.sku || '',
          category: product.category || 'Serum',
          brandName: product.clientBrand || selectedCustomer?.displayName || '',
        })
        setSelectedExistingProdId(productId)
        setVariantPickerLineKey(lineKey)
      }
    },
    [catalogProducts, loadVariantsForProduct, applyVariantToLine, updateLine, selectedCustomer]
  )

  const addLine = React.useCallback(() => {
    setLines((prev) => [
      ...prev,
      {
        ...makeEmptyLine(),
        brandName: selectedCustomer?.displayName || '',
      },
    ])
  }, [selectedCustomer])

  const duplicateLine = React.useCallback((line: OrderLineDraft) => {
    const newLine: OrderLineDraft = {
      ...line,
      key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line-${Math.random().toString(36).slice(2)}`,
      batchNo: '',
    }
    setLines((prev) => [...prev, newLine])
    flash('Product line duplicated', 'info')
  }, [])

  const removeLine = React.useCallback((key: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((line) => line.key !== key) : prev))
  }, [])

  // Purely client-side reorder of the `lines` array — the wizard's line items are
  // local component state before the order is saved, so no persisted backend
  // `reorder` API is needed; the existing save flow already sends `lines` in
  // array order, so the swapped order is naturally preserved on submit.
  const moveLine = React.useCallback((key: string, direction: 'up' | 'down') => {
    setLines((prev) => {
      const index = prev.findIndex((line) => line.key === key)
      if (index < 0) return prev
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= prev.length) return prev
      const next = [...prev]
      const source = next[index]
      next[index] = next[targetIndex]
      next[targetIndex] = source
      return next
    })
  }, [])

  // Wizard status validation
  const customerComplete = Boolean(selectedCustomer)
  const linesComplete = lines.some((line) => line.productId && Number(line.quantity) > 0 && Number(line.rate) > 0)

  const customerColumns = React.useMemo<ColumnDef<CustomerRow>[]>(() => [
    {
      id: 'displayName',
      header: 'Customer',
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="font-semibold text-sm">{row.original.displayName}</div>
          {row.original.legalName && row.original.legalName !== row.original.displayName ? (
            <div className="text-xs text-muted-foreground">{row.original.legalName}</div>
          ) : null}
          {row.original.gstin ? (
            <div className="text-xs text-muted-foreground font-mono">GST: {row.original.gstin}</div>
          ) : null}
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: ({ row }) => (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {row.original.phone ? <div>{row.original.phone}</div> : null}
          {row.original.email ? <div>{row.original.email}</div> : null}
        </div>
      ),
    },
    {
      id: 'commercial',
      header: 'Commercial Terms',
      cell: ({ row }) => {
        const terms = row.original.paymentTerms ? formatOptionLabel(row.original.paymentTerms) : null
        const remarks = row.original.paymentRemarks
        return (
          <div className="text-xs space-y-0.5">
            {terms ? <div className="font-medium text-foreground">{terms}</div> : null}
            {remarks ? <div className="text-muted-foreground truncate max-w-[200px]">{remarks}</div> : null}
            {!terms && !remarks ? <span className="text-muted-foreground">—</span> : null}
          </div>
        )
      },
    },
    {
      id: 'salesPoc',
      header: 'Sales Manager',
      cell: ({ row }) => row.original.salesPoc || '—',
    },
  ], [])

  const reviewLineColumns = React.useMemo<ColumnDef<OrderLineDraft>[]>(() => [
    {
      id: 'item',
      header: 'Item',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.productLabel || 'Custom Formulation'}</div>
          <div className="text-[11px] text-muted-foreground">
            Brand: <strong>{row.original.brandName || selectedCustomer?.displayName}</strong>
          </div>
        </div>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => row.original.category || 'Serum',
    },
    {
      id: 'pack',
      header: 'Pack',
      cell: ({ row }) => `${row.original.packSize} ${row.original.uom}`,
    },
    {
      id: 'qty',
      header: 'Qty',
      cell: ({ row }) => <span className="font-semibold">{row.original.quantity}</span>,
    },
    {
      id: 'batchNo',
      header: 'Batch No.',
      cell: ({ row }) => row.original.batchNo || '—',
    },
    {
      id: 'rate',
      header: 'Rate',
      cell: ({ row }) => formatINR(Number(row.original.rate) || 0),
    },
    {
      id: 'gst',
      header: 'GST',
      cell: ({ row }) => `${row.original.gstPercent}%`,
    },
    {
      id: 'total',
      header: 'Total',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span className="text-right font-bold text-status-success-text block">
          {formatINR(calcLineTotal(row.original))}
        </span>
      ),
    },
  ], [selectedCustomer])

  const steps: StepIndicatorStep[] = React.useMemo(
    () =>
      WIZARD_STEPS.map((step) => {
        let status: StepIndicatorStep['status'] = 'pending'
        if (step.id === activeStep) status = 'current'
        else if (step.id === 'customer' && customerComplete) status = 'complete'
        else if (step.id === 'lines' && linesComplete) status = 'complete'
        else if (step.id === 'details' && linesComplete) status = 'complete'
        return {
          id: step.id,
          label: step.label,
          status,
        }
      }),
    [activeStep, customerComplete, linesComplete]
  )

  // Running calculations
  const subtotal = React.useMemo(() => lines.reduce((acc, l) => acc + calcLineSubtotal(l), 0), [lines])
  const totalTax = React.useMemo(() => lines.reduce((acc, l) => acc + calcLineTax(l), 0), [lines])
  const grandTotal = subtotal + totalTax

  // Submit Order
  const handleSubmit = React.useCallback(async () => {
    if (!selectedCustomer) {
      flash('Select or create a customer to continue', 'error')
      setActiveStep('customer')
      return
    }
    const validLines = lines.filter((l) => l.productId && Number(l.quantity) > 0)
    if (!validLines.length) {
      flash('Add at least one product line with quantity', 'error')
      setActiveStep('lines')
      return
    }

    setSubmitting(true)
    try {
      const orderCustomFields: Record<string, unknown> = {
        order_type: orderType,
        priority,
        sales_poc: salesPoc || selectedCustomer.salesPoc || undefined,
        packaging_type: packagingType,
        pm_source: pmSource,
        artwork_requirement: artworkRequirement,
        // Kanban stage-gate mechanism: every new order starts in the 'new' pipeline stage;
        // the advance fields below drive the advance-confirmation gate on New -> Verified.
        order_stage: 'new',
        advance_required: advanceRequired,
        advance_percent: advanceRequired ? Number(advancePercent) || 0 : undefined,
        payment_ref: advanceRequired && paymentRef.trim() ? paymentRef.trim() : undefined,
        advance_received_amount: advanceRequired && advanceReceivedNow
          ? (advanceAmount ? Number(advanceAmount) : Math.round((grandTotal * (Number(advancePercent) || 0)) / 100))
          : (advanceAmount ? Number(advanceAmount) : undefined),
        advance_received_at: advanceRequired && advanceReceivedNow ? advanceReceivedDate : undefined,
      }

      const payload = {
        organizationId,
        tenantId,
        customerEntityId: selectedCustomer.id,
        currencyCode: 'INR',
        taxStrategyKey: 'gst_exclusive',
        placedAt: orderDate ? new Date(orderDate) : new Date(),
        expectedDeliveryAt: deliveryDate ? new Date(deliveryDate) : undefined,
        comments: orderNotes.trim() || undefined,
        customFields: orderCustomFields,
        metadata: {
          order_type: orderType,
          priority,
          packaging_type: packagingType,
          pm_source: pmSource,
          artwork_requirement: artworkRequirement,
          order_stage: 'new',
          subtotal,
          total_tax: totalTax,
          grand_total: grandTotal,
        },
        lines: validLines.map((line, idx) => {
          const qty = Number(line.quantity) || 0
          const rate = Number(line.rate) || 0
          const gst = Number(line.gstPercent) || 0
          const lineSubtotal = calcLineSubtotal(line)
          const lineTax = calcLineTax(line)
          const lineTotal = calcLineTotal(line)
          return {
            lineNumber: idx + 1,
            currencyCode: 'INR',
            productId: line.productId,
            name: line.productLabel,
            quantity: String(qty),
            unitPriceNet: String(rate),
            unitPriceGross: String(Math.round((rate * (1 + gst / 100)) * 100) / 100),
            priceMode: 'net',
            taxRate: String(gst),
            taxAmount: String(lineTax),
            totalNetAmount: String(lineSubtotal),
            totalGrossAmount: String(lineTotal),
            customFields: {
              line_kind: 'fg',
              variant_sku: line.variantSku || 'Standard',
              brand_name: line.brandName || selectedCustomer.displayName,
              pack_size: line.packSize,
              uom: line.uom,
              mrp: line.mrp ? Number(line.mrp) : undefined,
              unit_price: line.unitPrice ? Number(line.unitPrice) : undefined,
              batch_no: line.batchNo || undefined,
            },
          }
        }),
      }

      const created = await createCrud<{ id: string | null }>('sales/orders', payload)
      flash('Order booked successfully!', 'success')
      const newId = created.result?.id
      router.push(newId ? `/backend/sales/order-book/${newId}` : '/backend/sales/order-book')
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed to book order', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [
    selectedCustomer,
    lines,
    orderType,
    priority,
    salesPoc,
    orderDate,
    deliveryDate,
    packagingType,
    pmSource,
    artworkRequirement,
    orderNotes,
    advanceRequired,
    advancePercent,
    advanceAmount,
    advanceReceivedNow,
    advanceReceivedDate,
    paymentRef,
    subtotal,
    totalTax,
    grandTotal,
    organizationId,
    tenantId,
    router,
  ])

  return (
    <Page>
      <PageBody>
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
          {/* Header Title & Stepper */}
          <div className="flex flex-col gap-4 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-bold tracking-tight">Create New Sales Order</h1>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dermat India Contract Manufacturing Order Booking Flow
              </p>
            </div>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-1.5 text-xs">
                <Building2 className="h-4 w-4 text-primary" />
                <span>Client: <strong>{selectedCustomer.displayName}</strong></span>
              </div>
            ) : null}
          </div>

          <StepIndicator steps={steps} onStepClick={(id) => setActiveStep(id as WizardStepId)} />

          {/* ======================================================== */}
          {/* STEP 1: CUSTOMER & COMMERCIAL HEADER */}
          {/* ======================================================== */}
          {activeStep === 'customer' ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Customer / Company Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search customer by name, phone, GSTIN..."
                        className="pl-9"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateCustomerPanelOpen(true)}
                    >
                      + Create New Customer
                    </Button>
                  </div>

                  {selectedCustomer ? (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-semibold text-base text-foreground">{selectedCustomer.displayName}</span>
                          {selectedCustomer.legalName && selectedCustomer.legalName !== selectedCustomer.displayName ? (
                            <span className="text-xs text-muted-foreground font-normal">
                              ({selectedCustomer.legalName})
                            </span>
                          ) : null}
                          {selectedCustomer.gstin ? (
                            <span className="rounded bg-background px-2 py-0.5 text-xs font-mono border font-medium">
                              GST: {selectedCustomer.gstin}
                            </span>
                          ) : null}
                          {selectedCustomer.gstRegistrationType ? (
                            <span className="rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground border">
                              {formatOptionLabel(selectedCustomer.gstRegistrationType)}
                            </span>
                          ) : null}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs text-muted-foreground pt-0.5">
                          {selectedCustomer.phone ? (
                            <div><span className="font-medium text-foreground">Phone:</span> {selectedCustomer.phone}</div>
                          ) : null}
                          {selectedCustomer.email ? (
                            <div><span className="font-medium text-foreground">Email:</span> {selectedCustomer.email}</div>
                          ) : null}
                          {selectedCustomer.salesPoc ? (
                            <div><span className="font-medium text-foreground">Sales Manager:</span> {selectedCustomer.salesPoc}</div>
                          ) : null}
                          {selectedCustomer.address ? (
                            <div className="truncate"><span className="font-medium text-foreground">Address:</span> {selectedCustomer.address}</div>
                          ) : null}
                        </div>

                        {(selectedCustomer.paymentTerms || selectedCustomer.paymentRemarks) ? (
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                            <span className="font-medium text-foreground">Commercial Terms:</span>
                            {selectedCustomer.paymentTerms ? (
                              <span className="rounded bg-primary/10 text-primary font-medium px-2 py-0.5 border border-primary/20">
                                {formatOptionLabel(selectedCustomer.paymentTerms)}
                              </span>
                            ) : null}
                            {selectedCustomer.paymentRemarks ? (
                              <span className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-0.5 border border-amber-500/20 font-medium">
                                {selectedCustomer.paymentRemarks}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        {/* Any dynamically added custom attributes automatically reflected */}
                        {(() => {
                          const ignored = new Set([
                            'gstin', 'sales_manager', 'legal_trade_name', 'payment_terms',
                            'payment_remarks', 'gst_registration_type', 'customer_type_category',
                            'default_currency', 'address', 'phone', 'email', 'name', 'legal_name'
                          ])
                          const extraKeys = Object.keys(selectedCustomer.customFields ?? {}).filter(
                            (k) => !ignored.has(k) && selectedCustomer.customFields?.[k] !== undefined && selectedCustomer.customFields?.[k] !== null && selectedCustomer.customFields?.[k] !== ''
                          )
                          if (!extraKeys.length) return null
                          return (
                            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                              <span className="font-medium text-muted-foreground">Additional Attributes:</span>
                              {extraKeys.map((k) => (
                                <span key={k} className="rounded bg-background px-2 py-0.5 border text-foreground font-mono text-[11px]">
                                  {k.replace(/_/g, ' ')}: {String(selectedCustomer.customFields?.[k])}
                                </span>
                              ))}
                            </div>
                          )
                        })()}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCustomer(null)}
                        className="shrink-0"
                      >
                        Change Customer
                      </Button>
                    </div>
                  ) : null}

                  {!selectedCustomer ? (
                    <DataTable
                      columns={customerColumns}
                      data={customerRows}
                      embedded
                      isLoading={loadingCustomers}
                      onRowClick={(cust: CustomerRow) => {
                        setSelectedCustomer(cust)
                        if (cust.salesPoc && !salesPoc) setSalesPoc(cust.salesPoc)
                        if (cust.paymentRemarks) {
                          const match = cust.paymentRemarks.match(/(\d+)%\s*advance/i)
                          if (match && match[1]) {
                            setAdvanceRequired(true)
                            setAdvancePercent(match[1])
                          }
                        }
                      }}
                      emptyState={(
                        <EmptyState
                          size="sm"
                          title="No matching customers found"
                          description='Click "+ Create New Customer" to add one.'
                        />
                      )}
                    />
                  ) : null}
                </CardContent>
              </Card>

              <CreateCompanyPanel
                open={createCustomerPanelOpen}
                onOpenChange={setCreateCustomerPanelOpen}
                onCreated={handleCustomerCreated}
              />

              {/* Commercial Header Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Commercial & Order Header Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Sales Order #</Label>
                      <Input
                        value={nextOrderNumber ?? 'Generating…'}
                        disabled
                        className="bg-muted text-muted-foreground font-mono"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Auto-generated on save. The numbering format is configured in Sales Settings.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>Order Date *</Label>
                      <Input
                        type="date"
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Committed Delivery Date *</Label>
                      <Input
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Order Type</Label>
                      <Select value={orderType} onValueChange={(v: any) => setOrderType(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="New">New Order (First Batch)</SelectItem>
                          <SelectItem value="Repeat">Repeat Order</SelectItem>
                          <SelectItem value="Revision">Order Revision</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Operational Priority</Label>
                      <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Normal">Normal</SelectItem>
                          <SelectItem value="High">High Priority</SelectItem>
                          <SelectItem value="Urgent">Urgent / Rush</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Sales POC / Executive</Label>
                      <ComboboxInput
                        value={salesPoc}
                        onChange={setSalesPoc}
                        loadSuggestions={loadSalesPocSuggestions}
                        placeholder="Search sales team…"
                        allowCustomValues
                        clearable
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" asChild>
                  <a href="/backend/sales/order-book">Cancel</a>
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!selectedCustomer) {
                      flash('Please select or create a customer first', 'error')
                      return
                    }
                    setActiveStep('lines')
                  }}
                  disabled={!selectedCustomer}
                >
                  Continue to Products & Items <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* ======================================================== */}
          {/* STEP 2: PRODUCTS & ORDER ITEMS TABLE */}
          {/* ======================================================== */}
          {activeStep === 'lines' ? (
            <div className="space-y-6">
              <Card className="shadow-sm border-border/80">
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b gap-3">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Boxes className="h-5 w-5 text-primary" />
                      Ordered Products Table ({lines.length} {lines.length === 1 ? 'Item' : 'Items'})
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Selected products & variations for{' '}
                      <strong>{selectedCustomer?.displayName || 'Client'}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" onClick={addLine} className="text-xs">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add Row
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {selectedCustomer ? (
                    <div className="bg-primary/5 border-b border-primary/15 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span>
                          Customer / Brand: <strong className="text-foreground">{selectedCustomer.displayName}</strong>
                          {customerMatchingProducts.length > 0 ? (
                            <span className="ml-1 font-medium text-primary">
                              ({customerMatchingProducts.length} linked product{customerMatchingProducts.length > 1 ? 's' : ''} available)
                            </span>
                          ) : (
                            <span className="ml-1 text-muted-foreground">(No existing products linked to this customer)</span>
                          )}
                        </span>
                      </div>
                      {customerMatchingProducts.length > 0 && !lines[0]?.productId ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs font-medium"
                          onClick={() => handleSelectProductForLine(lines[0].key, customerMatchingProducts[0].id)}
                        >
                          Quick-Select: {customerMatchingProducts[0].title}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-muted/40 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <tr>
                          <th className="py-3 px-3 w-10 text-center">#</th>
                          <th className="py-3 px-3 min-w-[260px]">Product *</th>
                          <th className="py-3 px-3 min-w-[90px]">Qty *</th>
                          <th className="py-3 px-3 min-w-[110px]">Batch No.</th>
                          <th className="py-3 px-3 min-w-[90px] text-right">MRP (₹)</th>
                          <th className="py-3 px-3 min-w-[100px] text-right">Unit Price (₹)</th>
                          <th className="py-3 px-3 min-w-[100px]">Rate (₹) *</th>
                          <th className="py-3 px-3 min-w-[95px] text-right">Taxable</th>
                          <th className="py-3 px-3 min-w-[90px]">GST</th>
                          <th className="py-3 px-3 min-w-[110px] text-right">Total (₹)</th>
                          <th className="py-3 px-3 w-16 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {lines.map((line, idx) => (
                          <React.Fragment key={line.key}>
                          <tr className="hover:bg-muted/20 transition-colors">
                            {/* Column 1: Index */}
                            <td className="py-3 px-3 text-center align-middle font-mono font-bold text-muted-foreground text-xs">
                              {idx + 1}
                            </td>

                            {/* Column 2: Product — one search box (code + name match, code
                                shown first), an advanced-search icon button for the full
                                picker, and an optional "create new product" side-action.
                                Matches the client's real single-row attach-product flow. */}
                            <td className="py-3 px-3 align-middle">
                              <div className="space-y-1.5 min-w-[220px]">
                                <div className="flex items-center gap-1.5">
                                  <div className="flex-1">
                                    <ComboboxInput
                                      value={line.productId}
                                      onChange={(val) => {
                                        if (!val) {
                                          updateLine(line.key, { productId: '', productLabel: '', productCode: '' })
                                          return
                                        }
                                        handleSelectProductForLine(line.key, val)
                                      }}
                                      suggestions={productComboboxOptions}
                                      loadSuggestions={loadProductSuggestionsForLine}
                                      placeholder="Search product by code or name…"
                                      allowCustomValues={false}
                                      clearable
                                    />
                                  </div>
                                  <IconButton
                                    type="button"
                                    variant="outline"
                                    size="default"
                                    aria-label="Advanced product search"
                                    title="Advanced product search"
                                    onClick={() => {
                                      setCatalogSearchLineKey(line.key)
                                      setCatalogSearchQuery('')
                                      setCatalogSearchOpen(true)
                                    }}
                                  >
                                    <Binoculars className="h-4 w-4" />
                                  </IconButton>
                                </div>

                                {line.productId ? (
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    {line.variantSku ? (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                        {line.variantSku}
                                      </span>
                                    ) : null}
                                    {line.packSize ? (
                                      <span className="text-[10px] text-muted-foreground">{line.packSize} {line.uom}</span>
                                    ) : null}
                                    {line.productCode ? (
                                      <span className="font-mono text-muted-foreground text-[10px] truncate max-w-[100px]">
                                        Code: {line.productCode}
                                      </span>
                                    ) : null}
                                    {line.category ? (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {line.category}
                                      </span>
                                    ) : null}
                                    {line.brandName || selectedCustomer?.displayName ? (
                                      <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                                        Brand: {line.brandName || selectedCustomer?.displayName}
                                      </span>
                                    ) : null}
                                  </div>
                                ) : null}

                                {/* Single/zero-variant products: a plain editable pack-size
                                    field, pre-filled from the auto-applied variant but always
                                    visible and editable — never silently invisible. */}
                                {singleVariantLineKeys.has(line.key) && line.productId ? (
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      value={line.packSize}
                                      onChange={(e) => updateLine(line.key, { packSize: e.target.value })}
                                      placeholder="e.g. 50"
                                      className="h-7 w-20 text-[11px] font-mono"
                                      aria-label="Pack size"
                                    />
                                    <Select
                                      value={line.uom}
                                      onValueChange={(val) => updateLine(line.key, { uom: val })}
                                    >
                                      <SelectTrigger className="h-7 w-24 text-[11px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {uomOptions.map((opt) => (
                                          <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                            {opt.value}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                ) : null}

                                {/* Variant dropdown — only rendered when the selected product
                                    genuinely has 2+ variants (auto-applied otherwise, above). */}
                                {variantPickerLineKey === line.key ? (
                                  <div className="rounded-md border bg-muted/20 p-2 space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        Choose a variation
                                      </span>
                                      <span className="text-[10px] text-muted-foreground">{existingVariants.length} options</span>
                                    </div>
                                    {loadingVariants ? (
                                      <div className="text-[11px] text-muted-foreground">Loading variations…</div>
                                    ) : (
                                      <Select
                                        value=""
                                        onValueChange={(variantId) => {
                                          const product = catalogProducts.find((p) => p.id === line.productId)
                                          const v = existingVariants.find((entry) => entry.id === variantId)
                                          if (product && v) applyVariantToLine(line.key, product, v)
                                          setVariantPickerLineKey(null)
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-[11px] bg-background">
                                          <SelectValue placeholder="Select a variation…" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {existingVariants.map((v) => (
                                            <SelectItem key={v.id} value={v.id} className="text-xs">
                                              <span className="font-medium">
                                                {v.name} <span className="text-muted-foreground font-mono">({v.packSize} {v.uom})</span>
                                              </span>
                                              {v.mrp ? <span className="text-muted-foreground font-mono ml-2">MRP ₹{v.mrp}</span> : null}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            {/* Column 3: Order Qty (Units) */}
                            <td className="py-3 px-3 align-middle">
                              <Input
                                type="number"
                                min={1}
                                value={line.quantity}
                                onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                                placeholder="500"
                                className="text-xs h-8 font-mono font-semibold text-right"
                              />
                            </td>

                            {/* Column 4: Current Batch No. */}
                            <td className="py-3 px-3 align-middle">
                              <Input
                                value={line.batchNo}
                                onChange={(e) => updateLine(line.key, { batchNo: e.target.value })}
                                placeholder="e.g. B-2409"
                                className="text-xs h-8 font-mono"
                              />
                            </td>

                            {/* Column 5: MRP (auto-filled from product/variant, read-only) */}
                            <td className="py-3 px-3 align-middle text-right font-mono text-xs text-muted-foreground">
                              {line.mrp ? formatINR(Number(line.mrp)) : '—'}
                            </td>

                            {/* Column 6: Unit Price (₹) */}
                            <td className="py-3 px-3 align-middle">
                              <Input
                                type="number"
                                min={0}
                                value={line.unitPrice}
                                onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                                placeholder="0"
                                className="text-xs h-8 font-mono text-right"
                              />
                            </td>

                            {/* Column 7: Billing Rate (₹) */}
                            <td className="py-3 px-3 align-middle">
                              <Input
                                type="number"
                                min={0}
                                value={line.rate}
                                onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                                placeholder="180"
                                className="text-xs h-8 font-mono text-right"
                              />
                            </td>

                            {/* Column 8: Taxable Subtotal */}
                            <td className="py-3 px-3 align-middle text-right font-mono font-medium text-xs">
                              {formatINR(calcLineSubtotal(line))}
                            </td>

                            {/* Column 9: GST Rate */}
                            <td className="py-3 px-3 align-middle">
                              <Select
                                value={line.gstPercent}
                                onValueChange={(val) => updateLine(line.key, { gstPercent: val })}
                              >
                                <SelectTrigger className="text-xs h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {GST_RATES.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>

                            {/* Column 10: Line Total */}
                            <td className="py-3 px-3 align-middle text-right font-mono font-bold text-sm text-status-success-text">
                              {formatINR(calcLineTotal(line))}
                            </td>

                            {/* Column 11: Actions */}
                            <td className="py-3 px-3 align-middle text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => moveLine(line.key, 'up')}
                                  disabled={idx === 0}
                                  title="Move Up"
                                  aria-label="Move row up"
                                >
                                  <ArrowUp className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => moveLine(line.key, 'down')}
                                  disabled={idx === lines.length - 1}
                                  title="Move Down"
                                  aria-label="Move row down"
                                >
                                  <ArrowDown className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => duplicateLine(line)}
                                  title="Duplicate Row"
                                  aria-label="Duplicate row"
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => removeLine(line.key)}
                                  disabled={lines.length === 1}
                                  title="Remove Row"
                                  aria-label="Remove row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Footer */}
                  <div className="border-t bg-muted/30 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-4 text-xs">
                      <div>
                        <span className="text-muted-foreground">Total Formulations: </span>
                        <strong>{lines.length}</strong>
                      </div>
                      <div className="h-4 w-px bg-border" />
                      <div>
                        <span className="text-muted-foreground">Total Batch Units: </span>
                        <strong className="font-mono">{lines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0)} Units</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div className="text-xs space-y-0.5">
                        <div className="text-muted-foreground">
                          Taxable Subtotal: <strong className="text-foreground font-mono">{formatINR(subtotal)}</strong>
                        </div>
                        <div className="text-muted-foreground">
                          Total GST Tax: <strong className="text-foreground font-mono">{formatINR(totalTax)}</strong>
                        </div>
                      </div>
                      <div className="border-l pl-6">
                        <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                          Grand Total (INR)
                        </div>
                        <div className="text-xl font-black text-status-success-text font-mono">
                          {formatINR(grandTotal)}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setActiveStep('customer')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Customer
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!linesComplete) {
                      flash('Please select formulations and enter order quantities for all lines', 'error')
                      return
                    }
                    setActiveStep('details')
                  }}
                  disabled={!linesComplete}
                >
                  Continue to Packaging & R&D <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* ======================================================== */}
          {/* STEP 3: PACKAGING, R&D & DELIVERY REQUIREMENTS */}
          {/* ======================================================== */}
          {activeStep === 'details' ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Packaging & Artwork Specifications
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Primary Packaging Type</Label>
                      <Select value={packagingType} onValueChange={setPackagingType}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {packagingTypeOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Packaging Material (PM) Sourced By</Label>
                      <Select value={pmSource} onValueChange={(v: any) => setPmSource(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dermat">Dermat India Sourced</SelectItem>
                          <SelectItem value="client">Client / Party Supplied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label>Artwork & Label Requirement</Label>
                      <Select value={artworkRequirement} onValueChange={(v: any) => setArtworkRequirement(v)}>
                        <SelectTrigger>
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
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="h-5 w-5 text-primary" />
                    Order Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label>Order Notes & Special Production Instructions</Label>
                    <Textarea
                      rows={3}
                      value={orderNotes}
                      onChange={(e) => setOrderNotes(e.target.value)}
                      placeholder="e.g. Specific fragrance concentration, outer carton bundling instructions, batch code formatting..."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-primary" />
                    Payment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedCustomer && (selectedCustomer.paymentTerms || selectedCustomer.paymentRemarks) ? (
                    <div className="rounded-md border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-xs flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <span className="font-semibold text-foreground">Customer Commercial Policy: </span>
                          {selectedCustomer.paymentTerms ? (
                            <span className="font-medium text-primary">
                              {formatOptionLabel(selectedCustomer.paymentTerms)}
                            </span>
                          ) : null}
                          {selectedCustomer.paymentRemarks ? (
                            <span className="text-muted-foreground font-medium"> ({selectedCustomer.paymentRemarks})</span>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono bg-background px-2 py-0.5 rounded border">
                        Auto-linked from customer
                      </span>
                    </div>
                  ) : null}

                  <CheckboxField
                    checked={advanceRequired}
                    onCheckedChange={(checked) => setAdvanceRequired(checked === true)}
                    label="Advance Payment Required Before Order Is Verified/Official"
                  />

                  {advanceRequired ? (
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Advance Money (₹)</Label>
                            {grandTotal > 0 && advanceAmount ? (
                              <span className="text-[10px] font-semibold text-primary">
                                {Math.round((Number(advanceAmount) / grandTotal) * 100)}%
                              </span>
                            ) : null}
                          </div>
                          <Input
                            type="number"
                            min={0}
                            value={advanceAmount}
                            onChange={(e) => {
                              const val = e.target.value
                              setAdvanceAmount(val)
                              if (grandTotal > 0 && val) {
                                setAdvancePercent(String(Math.round((Number(val) / grandTotal) * 100)))
                              }
                            }}
                            placeholder={grandTotal > 0 ? String(Math.round((grandTotal * (Number(advancePercent) || 40)) / 100)) : 'e.g. 50000'}
                            className="font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Advance %</Label>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={advancePercent}
                            onChange={(e) => {
                              const val = e.target.value
                              setAdvancePercent(val)
                              if (grandTotal > 0 && val) {
                                setAdvanceAmount(String(Math.round((grandTotal * Number(val)) / 100)))
                              }
                            }}
                            placeholder="40"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Payment Reference / UTR #</Label>
                          <Input
                            value={paymentRef}
                            onChange={(e) => setPaymentRef(e.target.value)}
                            placeholder="UTR / cheque no. (optional)"
                          />
                        </div>
                      </div>

                      {/* Quick fill presets */}
                      {grandTotal > 0 ? (
                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          <span className="text-xs text-muted-foreground font-medium">Quick Presets:</span>
                          {[
                            { label: '25%', pct: 0.25 },
                            { label: '40%', pct: 0.40 },
                            { label: '50%', pct: 0.50 },
                            { label: '100% (Full)', pct: 1.0 },
                          ].map((p) => {
                            const amt = Math.round(grandTotal * p.pct)
                            return (
                              <Button
                                key={p.label}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAdvancePercent(String(Math.round(p.pct * 100)))
                                  setAdvanceAmount(String(amt))
                                }}
                              >
                                {p.label} (₹{amt.toLocaleString('en-IN')})
                              </Button>
                            )
                          })}
                        </div>
                      ) : null}

                      <CheckboxField
                        checked={advanceReceivedNow}
                        onCheckedChange={(checked) => {
                          const next = checked === true
                          setAdvanceReceivedNow(next)
                          if (next && !advanceReceivedDate) {
                            setAdvanceReceivedDate(new Date().toISOString().slice(0, 10))
                          }
                        }}
                        label="Advance already received from client"
                      />

                      {advanceReceivedNow ? (
                        <div className="space-y-1 max-w-xs">
                          <Label className="text-xs">Advance Received Date</Label>
                          <Input
                            type="date"
                            value={advanceReceivedDate}
                            onChange={(e) => setAdvanceReceivedDate(e.target.value)}
                          />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          If advance is not yet received, the order will wait in the Advance stage and you can record the exact money received when verifying the order.
                        </p>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setActiveStep('lines')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Products
                </Button>
                <Button type="button" onClick={() => setActiveStep('review')}>
                  Review & Book Order <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : null}

          {/* ======================================================== */}
          {/* STEP 4: REVIEW & CONFIRM ORDER */}
          {/* ======================================================== */}
          {activeStep === 'review' ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    Order Summary & Verification
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Customer & Header Summary */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-lg border bg-muted/20 p-4 text-xs">
                    <div className="space-y-1">
                      <div className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Customer Details</div>
                      <div className="text-sm font-bold">{selectedCustomer?.displayName}</div>
                      {selectedCustomer?.gstin ? <div>GST: {selectedCustomer.gstin}</div> : null}
                      {selectedCustomer?.phone ? <div>Phone: {selectedCustomer.phone}</div> : null}
                      {selectedCustomer?.address ? <div>Address: {selectedCustomer.address}</div> : null}
                    </div>
                    <div className="space-y-1 sm:text-right">
                      <div className="text-muted-foreground uppercase tracking-wide font-semibold text-[10px]">Commercial Terms</div>
                      <div>Order Date: <strong>{orderDate}</strong></div>
                      <div>Delivery Target: <strong>{deliveryDate}</strong></div>
                      <div>Type: <StatusBadge variant="neutral">{orderType}</StatusBadge> Priority: <StatusBadge variant={priority === 'Urgent' ? 'error' : 'neutral'}>{priority}</StatusBadge></div>
                    </div>
                  </div>

                  {/* Lines Summary Table */}
                  <DataTable
                    columns={reviewLineColumns}
                    data={lines}
                    embedded
                  />

                  {/* Specifications Summary */}
                  <div className="rounded-lg border p-3 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 bg-background">
                    <div>
                      <span className="text-muted-foreground">Packaging:</span>
                      <div className="font-semibold">{packagingType}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PM Source:</span>
                      <div className="font-semibold">{pmSource === 'dermat' ? 'Dermat India' : 'Client Supplied'}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Artwork:</span>
                      <div className="font-semibold">{artworkRequirement}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Advance:</span>
                      <div className="font-semibold">
                        {advanceRequired
                          ? `${advancePercent}% ${advanceReceivedNow ? `(received ${formatINR(Math.round((grandTotal * (Number(advancePercent) || 0)) / 100))})` : '(pending)'}`
                          : 'Not required'}
                      </div>
                    </div>
                  </div>

                  {/* Grand Totals */}
                  <div className="rounded-xl border bg-primary/5 p-4 flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Total Payable (INR)</div>
                      <div className="text-xs text-muted-foreground">Includes {formatINR(totalTax)} GST</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-black text-status-success-text">
                        {formatINR(grandTotal)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center justify-between pt-2">
                <Button type="button" variant="outline" onClick={() => setActiveStep('details')}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back to Specifications
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="px-8"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? 'Booking Order...' : 'Confirm & Book Order'}
                </Button>
              </div>
            </div>
          ) : null}
          {/* Advanced Catalog Search Dialog (Replaces clunky inline accordion) */}
          <Dialog open={catalogSearchOpen} onOpenChange={setCatalogSearchOpen}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
              <DialogHeader className="border-b pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <DialogTitle className="text-base font-bold flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      Select Formulation / Product from Catalog
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      Showing matching products for <strong>{selectedCustomer?.displayName || 'Client'}</strong> and global formulas
                    </p>
                  </div>
                </div>
                <div className="mt-3 relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={catalogSearchQuery}
                    onChange={(e) => setCatalogSearchQuery(e.target.value)}
                    placeholder="Search by product name, code (SKU), category, or brand..."
                    className="pl-9 h-9 text-xs"
                    autoFocus
                  />
                </div>
              </DialogHeader>

              <div className="overflow-y-auto flex-1 divide-y divide-border/60 -mx-6 px-6 py-2 max-h-[50vh]">
                {filteredCatalogProducts.length === 0 ? (
                  <div className="py-12 text-center text-xs text-muted-foreground space-y-3">
                    <Package className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p>No products found matching &ldquo;{catalogSearchQuery}&rdquo;</p>
                  </div>
                ) : (
                  filteredCatalogProducts.map((p) => {
                    const isCustMatch = selectedCustomer && isProductForCustomer(p, selectedCustomer)
                    return (
                      <div
                        key={p.id}
                        className="py-3 flex items-center justify-between gap-4 hover:bg-muted/30 px-3 rounded-lg transition-colors"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-foreground truncate">{p.title}</span>
                            {p.sku ? (
                              <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded border text-muted-foreground">
                                {p.sku}
                              </span>
                            ) : null}
                            {isCustMatch ? (
                              <span className="text-[10px] bg-primary/10 text-primary font-medium px-1.5 py-0.5 rounded">
                                Client Linked
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            {p.category ? <span>{p.category}</span> : null}
                            {p.baseUom ? <span>• Base: {p.baseUom}</span> : null}
                            {p.clientBrand ? <span>• Brand: {p.clientBrand}</span> : null}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs px-3 shrink-0"
                          onClick={() => {
                            if (catalogSearchLineKey) {
                              handleSelectProductForLine(catalogSearchLineKey, p.id)
                            }
                            setCatalogSearchOpen(false)
                          }}
                        >
                          Select
                        </Button>
                      </div>
                    )
                  })
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PageBody>
    </Page>
  )
}
