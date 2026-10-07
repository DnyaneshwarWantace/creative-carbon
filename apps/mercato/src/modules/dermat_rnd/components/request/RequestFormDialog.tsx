"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker } from '../../../dermat_orders/components/SearchPicker'
import { searchCustomers } from '../../../dermat_orders/components/loaders'
import { SuggestInput } from '../../../dermat_lists/components/SuggestInput'
import { Field } from '../shared/Field'
import { FormDialog } from '../shared/FormDialog'
import { useRdSend } from '../useRdApi'
import type { RdRequest } from '../types'
import { IngredientPicker } from './IngredientPicker'
import { bodyFromForm, type RequestForm } from './requestForm'

type RequestFormDialogProps = {
  form: RequestForm | null
  editing: RdRequest | null
  onChange: (form: RequestForm) => void
  onClose: () => void
  onSaved: (request: RdRequest) => void
}

type TextKey = 'productName' | 'brand' | 'packSize' | 'textureReference' | 'texture' | 'fragrance' | 'colour' | 'targetPh' | 'claims' | 'sampleQty'

export function RequestFormDialog({ form, editing, onChange, onClose, onSaved }: RequestFormDialogProps) {
  const t = useT()
  const { send, busy } = useRdSend('dermat-rnd-request-form')

  const save = async () => {
    if (!form) return
    if (!form.productName.trim()) return flash(t('dermat_rnd.nameNeeded', 'Name the product'), 'error')
    if (form.kind === 'client' && !form.customer && !form.orderId) return flash(t('dermat_rnd.clientNeeded', 'Pick the client, or choose New product'), 'error')
    const saved = await send<RdRequest>('/api/dermat_rnd/requests', editing ? 'PUT' : 'POST', bodyFromForm(form, editing?.id), {
      version: editing?.updatedAt ?? null,
      success: editing ? t('dermat_rnd.saved', '{code} saved', { code: editing.code }) : t('dermat_rnd.createdShort', 'R&D request raised'),
    })
    if (saved) onSaved(saved)
  }

  const text = (key: TextKey, label: string, placeholder?: string) => (
    <Field id={`rd-${key}`} label={label}>
      <Input id={`rd-${key}`} value={form?.[key] ?? ''} placeholder={placeholder} onChange={(event) => form && onChange({ ...form, [key]: event.target.value })} />
    </Field>
  )

  return (
    <FormDialog
      open={Boolean(form)}
      size="lg"
      busy={busy}
      title={editing ? t('dermat_rnd.editTitle', 'Edit {code}', { code: editing.code }) : t('dermat_rnd.newTitle', 'New R&D request')}
      description={t('dermat_rnd.newHint', 'The batch request R&D works from. The R&D number is given when you save.')}
      submitLabel={editing ? t('dermat_rnd.save', 'Save') : t('dermat_rnd.raise', 'Raise request')}
      onClose={onClose}
      onSubmit={() => void save()}
    >
      {form ? (
        <>
          <SegmentedControl value={form.kind} onValueChange={(value) => onChange({ ...form, kind: value as RequestForm['kind'] })} aria-label={t('dermat_rnd.kind', 'For')}>
            <SegmentedControlItem value="client">{t('dermat_rnd.forClient', 'For a client')}</SegmentedControlItem>
            <SegmentedControlItem value="npd">{t('dermat_rnd.forNpd', 'New product of our own (NPD)')}</SegmentedControlItem>
          </SegmentedControl>
          {form.kind === 'client' && !form.orderId ? (
            <Field id="rd-client" label={t('dermat_rnd.client', 'Client *')}>
              <SearchPicker value={form.customer} placeholder={t('dermat_rnd.pickClient', 'Pick the client')} searchPlaceholder={t('dermat_rnd.searchClient', 'Search clients')} load={searchCustomers} onSelect={(option) => onChange({ ...form, customer: option })} />
            </Field>
          ) : null}
          {form.orderId ? <p className="text-sm text-muted-foreground">{t('dermat_rnd.fromOrder', 'Linked to the order you came from.')}</p> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {text('productName', t('dermat_rnd.product', 'Product name *'), 'Vitamin C face serum')}
            {text('brand', t('dermat_rnd.brand', 'Brand name'))}
            <Field id="rd-productType" label={t('dermat_rnd.type', 'Product type')}>
              <SuggestInput id="rd-productType" listKey="rnd_product_types" value={form.productType} onChange={(event) => onChange({ ...form, productType: event.target.value })} />
            </Field>
            {text('packSize', t('dermat_rnd.pack', 'Pack size'), '30 ml')}
            {text('sampleQty', t('dermat_rnd.sampleQty', 'Sample quantity'), '2 × 50 g')}
            <Field id="rd-due" label={t('dermat_rnd.dueDate', 'Sample needed by')}>
              <Input id="rd-due" type="date" value={form.dueDate} onChange={(event) => onChange({ ...form, dueDate: event.target.value })} />
            </Field>
          </div>
          <Field id="rd-ingredients-pick" label={t('dermat_rnd.ingredientsWanted', 'Ingredients the client wants')} hint={t('dermat_rnd.ingredientsHint', 'Pick from the raw material list. Write anything not in the list below.')}>
            <IngredientPicker value={form.ingredientRefs} onChange={(ingredientRefs) => onChange({ ...form, ingredientRefs })} />
            <Textarea id="rd-ingredients" rows={2} value={form.ingredients} placeholder={t('dermat_rnd.ingredientsFree', 'Other ingredients, actives and their %')} onChange={(event) => onChange({ ...form, ingredients: event.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {text('textureReference', t('dermat_rnd.textureReference', 'Texture reference'), t('dermat_rnd.textureReferenceHint', 'A product name to match'))}
            {text('texture', t('dermat_rnd.texture', 'Texture'))}
            {text('fragrance', t('dermat_rnd.fragrance', 'Fragrance'))}
            {text('colour', t('dermat_rnd.colour', 'Colour'))}
            {text('targetPh', t('dermat_rnd.targetPh', 'Target pH'), '5.0 – 5.5')}
            {text('claims', t('dermat_rnd.claims', 'Claims'), t('dermat_rnd.claimsHint', 'Paraben free, vegan…'))}
          </div>
          <Field id="rd-instruction" label={t('dermat_rnd.clientInstruction', "Client's instruction")}>
            <Textarea id="rd-instruction" rows={2} value={form.clientInstruction} onChange={(event) => onChange({ ...form, clientInstruction: event.target.value })} />
          </Field>
          <Field id="rd-notes" label={t('dermat_rnd.notes', 'Notes')}>
            <Textarea id="rd-notes" rows={2} value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} />
          </Field>
        </>
      ) : null}
    </FormDialog>
  )
}
