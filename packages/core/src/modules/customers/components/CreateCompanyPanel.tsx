"use client"

import * as React from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  Building2,
  User,
  Check,
  Settings2,
  FileText,
  Hash,
  Calendar,
  ListFilter,
  CheckSquare,
  Sparkles,
} from 'lucide-react'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { fetchAssignableStaffMembers } from '../lib/assignableStaff'
import { E } from '#generated/entities.ids.generated'
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
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@open-mercato/ui/primitives/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { ContactRows, type CustomerContactValue } from './ContactRows'
import { COMPANY_FORM_RENDERED_SEPARATELY_KEYS } from './companyFormFieldKeys'

export type CreatedCompany = {
  id: string
  displayName: string
  primaryPhone?: string | null
  primaryEmail?: string | null
  addressLine1?: string | null
  customFields?: Record<string, unknown>
}

export type CreateCompanyPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (company: CreatedCompany) => void
  defaultCountryIso2?: string
}

type AddressState = {
  street: string
  pinCode: string
  district: string
  state: string
  country: string
}

const INITIAL_ADDRESS: AddressState = {
  street: '',
  pinCode: '',
  district: '',
  state: '',
  country: 'India',
}

const COUNTRY_OPTIONS = [
  { value: 'India', label: 'India' },
  { value: 'United States', label: 'United States' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'United Arab Emirates', label: 'United Arab Emirates' },
  { value: 'Singapore', label: 'Singapore' },
  { value: 'Australia', label: 'Australia' },
  { value: 'Germany', label: 'Germany' },
  { value: 'Canada', label: 'Canada' },
]

const EXCLUDED_CUSTOM_KEYS = COMPANY_FORM_RENDERED_SEPARATELY_KEYS

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
  }
  return map[val] || val
}

function createId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`
}

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

type FieldGroupProps = {
  label: React.ReactNode
  required?: boolean
  error?: string
  children: React.ReactNode
  className?: string
}

function FieldGroup({ label, required, error, children, className = '' }: FieldGroupProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs font-medium text-foreground flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

type AddressFormProps = {
  address: AddressState
  onChange: (patch: Partial<AddressState>) => void
  disabled?: boolean
  errors?: Record<string, string>
  errorPrefix?: string
}

function AddressForm({ address, onChange, disabled, errors = {}, errorPrefix = '' }: AddressFormProps) {
  return (
    <div className="space-y-3">
      <FieldGroup label="Street Address" required error={errors[`${errorPrefix}street`]}>
        <Input
          value={address.street}
          onChange={(e) => onChange({ street: e.target.value })}
          placeholder="Address Line 1, building, street, area..."
          disabled={disabled}
          aria-invalid={!!errors[`${errorPrefix}street`]}
        />
      </FieldGroup>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FieldGroup label="Pin Code" required>
          <Input
            value={address.pinCode}
            onChange={(e) => onChange({ pinCode: e.target.value })}
            placeholder="400001"
            disabled={disabled}
          />
        </FieldGroup>
        <FieldGroup label="District / City" required>
          <Input
            value={address.district}
            onChange={(e) => onChange({ district: e.target.value })}
            placeholder="District / City"
            disabled={disabled}
          />
        </FieldGroup>
        <FieldGroup label="State" required>
          <Input
            value={address.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="State"
            disabled={disabled}
          />
        </FieldGroup>
        <FieldGroup label="Country" required>
          <Select
            value={address.country}
            onValueChange={(v) => onChange({ country: v })}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldGroup>
      </div>
    </div>
  )
}

type CustomFieldDefinition = {
  key: string
  kind: string
  configJson?: {
    label?: string
    description?: string
    placeholder?: string
    options?: Array<string | { value: string; label: string }>
    required?: boolean
    formEditable?: boolean
  }
  isActive?: boolean
}

type AttributeTypeOption = {
  id: 'text' | 'integer' | 'date' | 'select' | 'boolean'
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const ATTRIBUTE_TYPES: AttributeTypeOption[] = [
  { id: 'text', label: 'Text', description: 'Names, codes, short text', icon: FileText },
  { id: 'integer', label: 'Number', description: 'Quantities, limits, amounts', icon: Hash },
  { id: 'date', label: 'Date', description: 'Calendar date, expiry, renewal', icon: Calendar },
  { id: 'select', label: 'Dropdown', description: 'Choose from a list of options', icon: ListFilter },
  { id: 'boolean', label: 'Yes / No', description: 'Simple toggle switch', icon: CheckSquare },
]

export function CreateCompanyPanel({
  open,
  onOpenChange,
  onCreated,
  defaultCountryIso2 = 'IN',
}: CreateCompanyPanelProps) {
  const t = useT()
  const { organizationId } = useOrganizationScopeDetail()

  // Customer Nature: Business vs Individual
  const [customerNature, setCustomerNature] = React.useState<'business' | 'individual'>('business')

  // Core fields
  const [customerName, setCustomerName] = React.useState('')
  const [legalTradeName, setLegalTradeName] = React.useState('')
  const [gstType, setGstType] = React.useState('unregistered')
  const [salesManager, setSalesManager] = React.useState('')
  const [paymentTerms, setPaymentTerms] = React.useState('due_on_delivery')
  const [paymentRemarks, setPaymentRemarks] = React.useState('')
  const [gstin, setGstin] = React.useState('')

  // Contacts
  const [contacts, setContacts] = React.useState<CustomerContactValue[]>([
    { id: createId(), name: '', phone: '', email: '' },
  ])

  // Addresses
  const [billingAddress, setBillingAddress] = React.useState<AddressState>(INITIAL_ADDRESS)
  const [shippingAddress, setShippingAddress] = React.useState<AddressState>(INITIAL_ADDRESS)
  const [sameAsBilling, setSameAsBilling] = React.useState(false)

  // Custom attributes definitions fetched from backend
  const [allBackendDefs, setAllBackendDefs] = React.useState<CustomFieldDefinition[]>([])
  const [customFieldValues, setCustomFieldValues] = React.useState<Record<string, unknown>>({})
  const [manageAttributesOpen, setManageAttributesOpen] = React.useState(false)

  // Add Attribute Form state
  const [newFieldLabel, setNewFieldLabel] = React.useState('')
  const [newFieldType, setNewFieldType] = React.useState<'text' | 'integer' | 'date' | 'select' | 'boolean'>('text')
  const [newFieldOptions, setNewFieldOptions] = React.useState('')
  const [newFieldRequired, setNewFieldRequired] = React.useState(false)
  const [isSavingField, setIsSavingField] = React.useState(false)
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null)

  // Staff members (sales managers)
  const [staffList, setStaffList] = React.useState<Array<{ value: string; label: string }>>([])
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  // Load custom field definitions from backend API
  const loadCustomDefinitions = React.useCallback(async () => {
    try {
      const entityId = E.customers.customer_company_profile
      const res = await readApiResultOrThrow<{ items?: CustomFieldDefinition[] }>(
        `/api/entities/definitions.manage?entityId=${encodeURIComponent(entityId)}`,
        undefined,
        { errorMessage: 'Failed to load custom fields', fallback: { items: [] } },
      )
      const items = (res.items || []).filter((item) => item.isActive !== false)
      setAllBackendDefs(items)
    } catch {
      // Non-blocking fallback
    }
  }, [])

  // Derive dynamic dropdown options from the backend definitions
  const gstTypeOptions = React.useMemo(() => {
    const def = allBackendDefs.find((d) => d.key === 'gst_registration_type')
    const raw = def?.configJson?.options
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((opt) => {
        if (typeof opt === 'string') return { value: opt, label: formatOptionLabel(opt) }
        return { value: opt.value, label: opt.label || formatOptionLabel(opt.value) }
      })
    }
    return [
      { value: 'unregistered', label: 'Unregistered' },
      { value: 'registered', label: 'Registered Regular' },
      { value: 'composition', label: 'Composition Scheme' },
      { value: 'overseas', label: 'Overseas / SEZ' },
    ]
  }, [allBackendDefs])

  const paymentTermsOptions = React.useMemo(() => {
    const def = allBackendDefs.find((d) => d.key === 'payment_terms')
    const raw = def?.configJson?.options
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((opt) => {
        if (typeof opt === 'string') return { value: opt, label: formatOptionLabel(opt) }
        return { value: opt.value, label: opt.label || formatOptionLabel(opt.value) }
      })
    }
    return [
      { value: 'due_on_delivery', label: 'Due on Delivery' },
      { value: '15_days', label: '15 Days' },
      { value: '30_days', label: '30 Days' },
      { value: '45_days', label: '45 Days' },
      { value: '60_days', label: '60 Days' },
      { value: '90_days', label: '90 Days' },
    ]
  }, [allBackendDefs])

  const paymentRemarksOptions = React.useMemo(() => {
    const def = allBackendDefs.find((d) => d.key === 'payment_remarks')
    const raw = def?.configJson?.options
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((opt) => {
        if (typeof opt === 'string') return { value: opt, label: opt }
        return { value: opt.value, label: opt.label || opt.value }
      })
    }
    return [
      { value: '90 DAYS', label: '90 DAYS' },
      { value: '60DAYS CREDIT', label: '60DAYS CREDIT' },
      { value: 'As Discussed', label: 'As Discussed' },
      { value: '20% ADVANCE', label: '20% ADVANCE' },
      { value: '25% Advance and 75% Before Dispatch', label: '25% Advance and 75% Before Dispatch' },
      { value: '40% advance 60% before dispatch', label: '40% advance 60% before dispatch' },
      { value: '50% advance and 50% before dispatch', label: '50% advance and 50% before dispatch' },
      { value: '30% Advance 70% before Dispatch', label: '30% Advance 70% before Dispatch' },
    ]
  }, [allBackendDefs])

  // Only genuinely user-added custom attributes (excluding all core fields & legacy sample fields)
  const userCustomDefs = React.useMemo(() => {
    return allBackendDefs.filter((def) => !EXCLUDED_CUSTOM_KEYS.has(def.key) && def.configJson?.formEditable !== false)
  }, [allBackendDefs])

  // Fetch sales managers & custom field definitions
  React.useEffect(() => {
    let cancelled = false
    void fetchAssignableStaffMembers('', { pageSize: 50 })
      .then((items) => {
        if (!cancelled && items) {
          setStaffList(
            items.map((m) => ({
              value: m.displayName || m.email || m.userId,
              label: m.displayName
                ? `${m.displayName} (${m.email ?? 'Staff'})`
                : m.email ?? m.userId,
            })),
          )
        }
      })
      .catch(() => {})

    void loadCustomDefinitions()

    return () => {
      cancelled = true
    }
  }, [loadCustomDefinitions])

  // Reset form state when opened
  React.useEffect(() => {
    if (open) {
      setCustomerNature('business')
      setCustomerName('')
      setLegalTradeName('')
      setGstType('unregistered')
      setSalesManager('')
      setPaymentTerms('due_on_delivery')
      setPaymentRemarks('')
      setGstin('')
      setContacts([{ id: createId(), name: '', phone: '', email: '' }])
      setBillingAddress(INITIAL_ADDRESS)
      setShippingAddress(INITIAL_ADDRESS)
      setSameAsBilling(false)
      setCustomFieldValues({})
      setErrors({})
      void loadCustomDefinitions()
    }
  }, [open, loadCustomDefinitions])

  // Handle adding a new attribute in simple, friendly modal
  const handleAddNewAttribute = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedLabel = newFieldLabel.trim()
    if (!trimmedLabel) {
      flash('Please enter a field name', 'error')
      return
    }

    let generatedKey = slugifyLabel(trimmedLabel)
    if (!generatedKey) generatedKey = `field_${Date.now()}`
    if (allBackendDefs.some((d) => d.key === generatedKey)) {
      generatedKey = `${generatedKey}_${Date.now().toString().slice(-4)}`
    }

    const optionsList =
      newFieldType === 'select'
        ? newFieldOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined

    if (newFieldType === 'select' && (!optionsList || optionsList.length === 0)) {
      flash('Please enter at least one dropdown option (e.g. North, South)', 'error')
      return
    }

    setIsSavingField(true)
    try {
      const newDefinition = {
        key: generatedKey,
        kind: newFieldType,
        configJson: {
          label: trimmedLabel,
          required: newFieldRequired,
          ...(optionsList ? { options: optionsList } : {}),
          ...(newFieldType === 'boolean' ? { defaultValue: false } : {}),
        },
        isActive: true,
      }

      const existingDefinitions = allBackendDefs.map((d) => ({
        key: d.key,
        kind: d.kind,
        configJson: d.configJson,
        isActive: d.isActive !== false,
      }))

      const payload = {
        entityId: E.customers.customer_company_profile,
        definitions: [...existingDefinitions, newDefinition],
      }

      const res = await apiCall('/api/entities/definitions.batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        throw new Error('Failed to save field definition')
      }

      flash(`Added "${trimmedLabel}" successfully!`, 'success')
      setNewFieldLabel('')
      setNewFieldType('text')
      setNewFieldOptions('')
      setNewFieldRequired(false)
      await loadCustomDefinitions()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not add custom attribute'
      flash(msg, 'error')
    } finally {
      setIsSavingField(false)
    }
  }

  // Handle deleting an attribute from the list
  const handleDeleteAttribute = async (key: string, label: string) => {
    setDeletingKey(key)
    try {
      const res = await apiCall('/api/entities/definitions', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          entityId: E.customers.customer_company_profile,
          key,
        }),
      })

      if (!res.ok) {
        throw new Error('Failed to delete attribute')
      }

      flash(`Removed "${label}"`, 'success')
      await loadCustomDefinitions()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not delete custom attribute'
      flash(msg, 'error')
    } finally {
      setDeletingKey(null)
    }
  }

  const effectiveShipping = sameAsBilling ? billingAddress : shippingAddress

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const newErrors: Record<string, string> = {}
    if (!customerName.trim()) newErrors.customerName = 'Customer Name is required'
    if (!legalTradeName.trim()) newErrors.legalTradeName = 'Legal / Trade Name is required'
    if (!billingAddress.street.trim()) newErrors.billing_street = 'Billing Street Address is required'

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      flash('Please fill in all required fields', 'error')
      return
    }

    setIsSubmitting(true)
    try {
      const primaryContact = contacts[0]
      const formattedPrimaryPhone = primaryContact?.phone?.trim() || undefined
      const primaryEmail = primaryContact?.email?.trim() || undefined

      const payload: Record<string, unknown> = {
        displayName: customerName.trim(),
        legalName: legalTradeName.trim(),
        primaryEmail,
        primaryPhone: formattedPrimaryPhone,
        ...(organizationId ? { organizationId } : {}),
        customFields: {
          customer_type_category: customerNature,
          legal_trade_name: legalTradeName.trim() || undefined,
          gst_registration_type: gstType,
          sales_manager: salesManager.trim() || undefined,
          default_currency: 'INR',
          payment_terms: paymentTerms,
          payment_remarks: paymentRemarks.trim() || undefined,
          gstin: gstin.trim() || undefined,
          ...customFieldValues,
        },
      }

      const { result: created } = await createCrud<{ id?: string; entityId?: string }>(
        'customers/companies',
        payload,
      )
      const newId =
        created && typeof created.id === 'string'
          ? created.id
          : typeof created?.entityId === 'string'
            ? created.entityId
            : null

      if (!newId) throw new Error('Failed to create customer profile')

      // Save billing address
      if (billingAddress.street.trim()) {
        try {
          await createCrud('customers/addresses', {
            entityId: newId,
            ...(organizationId ? { organizationId } : {}),
            purpose: 'billing',
            addressLine1: billingAddress.street.trim(),
            postalCode: billingAddress.pinCode.trim() || undefined,
            city: billingAddress.district.trim() || undefined,
            region: billingAddress.state.trim() || undefined,
            country: billingAddress.country || 'IN',
            isPrimary: true,
          })
        } catch (addrErr) {
          console.error('Failed to save billing address', addrErr)
        }
      }

      // Save shipping address (if not same as billing)
      if (!sameAsBilling && effectiveShipping.street.trim()) {
        try {
          await createCrud('customers/addresses', {
            entityId: newId,
            ...(organizationId ? { organizationId } : {}),
            purpose: 'shipping',
            addressLine1: effectiveShipping.street.trim(),
            postalCode: effectiveShipping.pinCode.trim() || undefined,
            city: effectiveShipping.district.trim() || undefined,
            region: effectiveShipping.state.trim() || undefined,
            country: effectiveShipping.country || 'IN',
            isPrimary: false,
          })
        } catch (addrErr) {
          console.error('Failed to save shipping address', addrErr)
        }
      }

      // Save contacts
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i]
        if (contact.name.trim() || contact.phone?.trim() || contact.email?.trim()) {
          try {
            await createCrud('customers/contacts', {
              entityId: newId,
              ...(organizationId ? { organizationId } : {}),
              name: contact.name.trim() || customerName.trim(),
              phone: contact.phone?.trim() || undefined,
              email: contact.email?.trim() || undefined,
              sortOrder: i,
            })
          } catch (contactErr) {
            console.error('Failed to save contact row', contactErr)
          }
        }
      }

      flash(t('customers.companies.form.success', 'Customer created successfully'), 'success')
      onOpenChange(false)
      onCreated({
        id: newId,
        displayName: customerName.trim(),
        primaryPhone: formattedPrimaryPhone,
        primaryEmail,
        addressLine1: billingAddress.street.trim() || null,
        customFields: payload.customFields as Record<string, unknown>,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create customer'
      flash(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl lg:max-w-3xl p-0 flex flex-col bg-background border-l border-border"
        >
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b border-border bg-card flex-row items-center justify-between space-y-0">
            <div>
              <SheetTitle className="text-base font-semibold text-foreground">
                Add New Customer
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create a complete customer profile with commercial details, addresses, and contacts
              </p>
            </div>
          </SheetHeader>

          {/* Form Content */}
          <form
            id="create-customer-slideover-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
          >
            {/* Customer Type Selector: Business vs Individual */}
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer Type
              </span>
              <div className="grid grid-cols-2 gap-3 max-w-sm">
                <button
                  type="button"
                  onClick={() => setCustomerNature('business')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                    customerNature === 'business'
                      ? 'border-primary bg-primary/5 text-primary shadow-xs'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                  <span>Business</span>
                  {customerNature === 'business' && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerNature('individual')}
                  className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                    customerNature === 'individual'
                      ? 'border-primary bg-primary/5 text-primary shadow-xs'
                      : 'border-border bg-card hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <User className="h-4 w-4" />
                  <span>Individual</span>
                  {customerNature === 'individual' && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
                </button>
              </div>
            </div>

            {/* Core Fields in 2-Column Responsive Grid */}
            <div className="space-y-4">
              <div className="border-b border-border/60 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Company Details
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FieldGroup label="Customer Name" required error={errors.customerName}>
                  <Input
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value)
                      if (errors.customerName) setErrors((prev) => ({ ...prev, customerName: '' }))
                    }}
                    placeholder="e.g. Acme Health Products"
                    aria-invalid={!!errors.customerName}
                  />
                </FieldGroup>

                <FieldGroup label="Legal / Trade Name" required error={errors.legalTradeName}>
                  <Input
                    value={legalTradeName}
                    onChange={(e) => {
                      setLegalTradeName(e.target.value)
                      if (errors.legalTradeName) setErrors((prev) => ({ ...prev, legalTradeName: '' }))
                    }}
                    placeholder="e.g. Acme Health Products Pvt Ltd"
                    aria-invalid={!!errors.legalTradeName}
                  />
                </FieldGroup>

                <FieldGroup label="Customer Type (GST)">
                  <Select value={gstType} onValueChange={setGstType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {gstTypeOptions.map((opt, optIdx) => (
                        <SelectItem key={opt.value || `gst-${optIdx}`} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Sales Manager">
                  <Select value={salesManager} onValueChange={setSalesManager}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {staffList.map((s, idx) => (
                        <SelectItem key={s.value || `staff-${idx}`} value={s.value || `staff-${idx}`}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Payment Terms">
                  <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTermsOptions.map((p, pIdx) => (
                        <SelectItem key={p.value || `pt-${pIdx}`} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="Payment Remarks">
                  <Select value={paymentRemarks} onValueChange={setPaymentRemarks}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Payment Remark" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentRemarksOptions.map((p, prIdx) => (
                        <SelectItem key={p.value || `pr-${prIdx}`} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>

                <FieldGroup label="GSTIN" className="md:col-span-2">
                  <Input
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    maxLength={15}
                  />
                </FieldGroup>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Contact Information
                </h3>
              </div>
              <ContactRows
                contacts={contacts}
                onChange={setContacts}
                t={t}
                defaultCountryIso2={defaultCountryIso2}
              />
            </div>

            {/* Billing Address */}
            <div className="space-y-3 pt-2">
              <div className="border-b border-border/60 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Billing Address
                </h3>
              </div>
              <AddressForm
                address={billingAddress}
                onChange={(patch) => setBillingAddress((prev) => ({ ...prev, ...patch }))}
                errors={errors}
                errorPrefix="billing_"
              />
            </div>

            {/* Shipping Address */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between border-b border-border/60 pb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Shipping Address
                </h3>
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors">
                  <Checkbox
                    checked={sameAsBilling}
                    onCheckedChange={(checked) => setSameAsBilling(checked === true)}
                  />
                  <span>Same as Billing Address</span>
                </label>
              </div>
              <AddressForm
                address={effectiveShipping}
                onChange={(patch) => setShippingAddress((prev) => ({ ...prev, ...patch }))}
                disabled={sameAsBilling}
              />
            </div>

            {/* Custom Attributes Section with User-Friendly "Manage Attributes" */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Custom Attributes
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Extra custom fields configured for your customers
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setManageAttributesOpen(true)}
                  className="gap-1.5 h-8 text-xs font-medium"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Manage Attributes
                </Button>
              </div>

              {userCustomDefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-1">
                  {userCustomDefs.map((def, defIdx) => {
                    const fieldKey = def.key || `custom-def-${defIdx}`
                    const label = def.configJson?.label || def.key || `Field ${defIdx + 1}`
                    const isRequired = def.configJson?.required === true
                    const currentValue = customFieldValues[fieldKey]

                    if (def.kind === 'boolean') {
                      return (
                        <div key={fieldKey} className="flex items-center gap-2 pt-4">
                          <Checkbox
                            checked={Boolean(currentValue)}
                            onCheckedChange={(checked) =>
                              setCustomFieldValues((prev) => ({ ...prev, [fieldKey]: checked === true }))
                            }
                          />
                          <Label className="text-xs font-medium text-foreground cursor-pointer">
                            {label}
                          </Label>
                        </div>
                      )
                    }

                    if (def.kind === 'select' && Array.isArray(def.configJson?.options)) {
                      return (
                        <FieldGroup key={fieldKey} label={label} required={isRequired}>
                          <Select
                            value={typeof currentValue === 'string' ? currentValue : ''}
                            onValueChange={(val) =>
                              setCustomFieldValues((prev) => ({ ...prev, [fieldKey]: val }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={def.configJson?.placeholder || `Select ${label}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {def.configJson.options.map((opt, optIdx) => {
                                const optVal = typeof opt === 'string' ? opt : opt.value
                                const optLabel = typeof opt === 'string' ? opt : opt.label || opt.value
                                return (
                                  <SelectItem key={String(optVal || optIdx)} value={String(optVal || optIdx)}>
                                    {optLabel}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </FieldGroup>
                      )
                    }

                    return (
                      <FieldGroup key={fieldKey} label={label} required={isRequired}>
                        <Input
                          type={
                            def.kind === 'integer' || def.kind === 'float' || def.kind === 'number'
                              ? 'number'
                              : def.kind === 'date'
                                ? 'date'
                                : 'text'
                          }
                          value={typeof currentValue === 'string' || typeof currentValue === 'number' ? String(currentValue) : ''}
                          onChange={(e) =>
                            setCustomFieldValues((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                          }
                          placeholder={def.configJson?.placeholder || `Enter ${label}`}
                        />
                      </FieldGroup>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border/80 p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    No custom attributes added yet. Click &quot;Manage Attributes&quot; to easily add any extra field you need.
                  </p>
                </div>
              )}
            </div>
          </form>

          {/* Sticky Bottom Actions Bar */}
          <div className="flex items-center justify-between border-t border-border bg-card px-6 py-3.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="create-customer-slideover-form"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Customer
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Simple, Non-Technical Custom Attribute Manager Modal */}
      <Dialog open={manageAttributesOpen} onOpenChange={setManageAttributesOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-6 space-y-6">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <span>Manage Custom Attributes</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Easily add or remove custom fields for your customers without complex settings.
            </p>
          </DialogHeader>

          {/* Current Custom Fields List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Current Custom Fields ({userCustomDefs.length})
            </span>
            {userCustomDefs.length > 0 ? (
              <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
                {userCustomDefs.map((def) => {
                  const label = def.configJson?.label || def.key
                  const typeObj = ATTRIBUTE_TYPES.find((t) => t.id === def.kind)
                  const isDeleting = deletingKey === def.key

                  return (
                    <div key={def.key} className="flex items-center justify-between p-3 text-sm">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{label}</span>
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {typeObj?.label || def.kind}
                          </span>
                          {def.configJson?.required && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              Required
                            </span>
                          )}
                        </div>
                        {def.kind === 'select' && Array.isArray(def.configJson?.options) && (
                          <p className="text-xs text-muted-foreground truncate max-w-sm">
                            Options: {def.configJson.options.map((o) => (typeof o === 'string' ? o : o.label || o.value)).join(', ')}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={isDeleting}
                        onClick={() => handleDeleteAttribute(def.key, label)}
                        className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                      >
                        {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 p-3 text-center text-xs text-muted-foreground">
                No custom fields added yet. Fill in the form below to create one.
              </div>
            )}
          </div>

          {/* Add New Custom Field Form */}
          <form onSubmit={handleAddNewAttribute} className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-foreground">
              <Plus className="h-4 w-4 text-primary" />
              <span>Add New Field</span>
            </div>

            {/* Field Name */}
            <FieldGroup label="Field Name" required>
              <Input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g. License Number, Delivery Route, Alternate Phone..."
                className="bg-card"
              />
            </FieldGroup>

            {/* Field Type Selection Cards */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">Field Type</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {ATTRIBUTE_TYPES.map((type) => {
                  const Icon = type.icon
                  const isSelected = newFieldType === type.id
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setNewFieldType(type.id)}
                      className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary shadow-xs'
                          : 'border-border bg-card hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-4 w-4" />
                        <span className="text-xs font-semibold">{type.label}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                        {type.description}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* If Dropdown type: choices input */}
            {newFieldType === 'select' && (
              <FieldGroup label="Dropdown Options (separated by commas)" required>
                <Input
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                  placeholder="e.g. North, South, East, West"
                  className="bg-card"
                />
              </FieldGroup>
            )}

            {/* Required Field Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground pt-1">
              <Checkbox
                checked={newFieldRequired}
                onCheckedChange={(checked) => setNewFieldRequired(checked === true)}
              />
              <span>Is this field required when creating customers?</span>
            </label>

            {/* Submit Button */}
            <div className="pt-2 flex justify-end">
              <Button type="submit" disabled={isSavingField || !newFieldLabel.trim()} size="sm" className="gap-1.5">
                {isSavingField ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Add Field
              </Button>
            </div>
          </form>

          {/* Modal Footer */}
          <div className="flex justify-end pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm" onClick={() => setManageAttributesOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
