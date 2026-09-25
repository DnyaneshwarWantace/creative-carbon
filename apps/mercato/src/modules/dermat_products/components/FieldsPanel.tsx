"use client"

import * as React from 'react'
import { Eye, EyeOff, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { KIND_CONFIG } from '../lib/kindConfig'
import type { ProductKind } from '../lib/kinds'
import {
  PRODUCT_ENTITY_ID,
  buildDefinitionPayload,
  fieldKeyFromLabel,
  fieldsFromOtherKinds,
  type ProductFieldDef,
} from '../lib/fieldDefs'

export type PanelField = { key: string; label: string; locked?: boolean }

type NewFieldType = 'text' | 'number' | 'list'

type FieldsPanelProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: ProductKind
  fields: PanelField[]
  defs: ProductFieldDef[]
  hidden: Set<string>
  onHiddenSaved: (hidden: Set<string>) => void
  onDefinitionsChanged: () => Promise<void>
}

function kindLabels(fieldsets: string[]): string {
  return fieldsets
    .map((code) => KIND_CONFIG[code as ProductKind]?.singular)
    .filter(Boolean)
    .join(', ')
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
}

export function FieldsPanel({ open, onOpenChange, kind, fields, defs, hidden, onHiddenSaved, onDefinitionsChanged }: FieldsPanelProps) {
  const t = useT()
  const config = KIND_CONFIG[kind]
  const { runMutation } = useGuardedMutation({ contextId: `dermat-product-fields-${kind}` })
  const [draftHidden, setDraftHidden] = React.useState<Set<string>>(hidden)
  const [busy, setBusy] = React.useState(false)
  const [newLabel, setNewLabel] = React.useState('')
  const [newType, setNewType] = React.useState<NewFieldType>('text')
  const [newOptions, setNewOptions] = React.useState('')
  const [newError, setNewError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (open) setDraftHidden(new Set(hidden))
  }, [open, hidden])

  const suggestions = React.useMemo(() => fieldsFromOtherKinds(defs, kind), [defs, kind])

  const toggle = (key: string) =>
    setDraftHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const saveHidden = async () => {
    setBusy(true)
    try {
      const hiddenFields = Array.from(draftHidden)
      await runMutation({
        context: { kind, setting: 'hiddenFields' },
        mutationPayload: { kind, hiddenFields },
        operation: () => updateCrud('dermat_products/field-settings', { kind, hiddenFields }),
      })
      onHiddenSaved(new Set(draftHidden))
      flash(t('dermat_products.flash.fieldsSaved', 'Field settings saved'), 'success')
      onOpenChange(false)
    } catch {
      flash(t('dermat_products.flash.fieldsFailed', 'Could not save field settings.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const addExisting = async (def: ProductFieldDef) => {
    setBusy(true)
    try {
      const payload = buildDefinitionPayload(def, Array.from(new Set([...def.fieldsets, kind])))
      await runMutation({
        context: { kind, field: def.key },
        mutationPayload: payload,
        operation: () => createCrud('entities/definitions', payload),
      })
      await onDefinitionsChanged()
      flash(t('dermat_products.flash.fieldAdded', '"{label}" added to {kind}', { label: def.label, kind: config.title }), 'success')
    } catch {
      flash(t('dermat_products.flash.fieldAddFailed', 'Could not add the field. Only admins can change fields.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const createField = async () => {
    const label = newLabel.trim()
    const key = fieldKeyFromLabel(label)
    const options = newOptions
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (!label || !key) {
      setNewError(t('dermat_products.fields.errors.label', 'Enter a field name.'))
      return
    }
    if (defs.some((def) => def.key === key)) {
      setNewError(t('dermat_products.fields.errors.exists', 'A field with this name already exists — add it from the list above.'))
      return
    }
    if (newType === 'list' && options.length < 2) {
      setNewError(t('dermat_products.fields.errors.options', 'Enter at least two options, one per line.'))
      return
    }
    setNewError(null)
    setBusy(true)
    try {
      await runMutation({
        context: { kind, field: key },
        mutationPayload: { label, type: newType, options },
        operation: async () => {
          let dictionaryId: string | null = null
          if (newType === 'list') {
            const dictionary = await createCrud<{ id?: string }>('dictionaries', {
              key: `product_${key}`.slice(0, 100),
              name: label,
              description: `Options for the product field "${label}".`,
            })
            dictionaryId = dictionary.result?.id ?? null
            if (!dictionaryId) throw new Error('[internal] dictionary id missing')
            for (const [position, value] of options.entries()) {
              await apiCall(`/api/dictionaries/${dictionaryId}/entries`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ value, label: value, position }),
              })
            }
          }
          await createCrud('entities/definitions', {
            entityId: PRODUCT_ENTITY_ID,
            key,
            kind: newType === 'list' ? 'dictionary' : newType === 'number' ? 'float' : 'text',
            configJson: {
              label,
              fieldsets: [kind],
              formEditable: true,
              ...(dictionaryId ? { dictionaryId } : {}),
            },
          })
        },
      })
      await onDefinitionsChanged()
      setNewLabel('')
      setNewOptions('')
      setNewType('text')
      flash(t('dermat_products.flash.fieldCreated', '"{label}" created', { label }), 'success')
    } catch {
      flash(t('dermat_products.flash.fieldCreateFailed', 'Could not create the field. Only admins can change fields.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const typeButton = (value: NewFieldType, label: string) => (
    <button
      type="button"
      onClick={() => setNewType(value)}
      className={cn(
        'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
        newType === value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      {label}
    </button>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('dermat_products.fields.title', '{kind} fields', { kind: config.singular })}</SheetTitle>
          <SheetDescription className="text-xs">
            {t('dermat_products.fields.hint', 'Choose what this form shows. Changes apply to everyone.')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-auto p-4">
          <section className="space-y-2">
            <SectionTitle>{t('dermat_products.fields.onForm', 'Fields on this form')}</SectionTitle>
            <ul className="divide-y rounded-md border">
              {fields.map((field) => {
                const isHidden = draftHidden.has(field.key)
                return (
                  <li key={field.key} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className={cn(isHidden && 'text-muted-foreground line-through')}>{field.label}</span>
                    {field.locked ? (
                      <span className="text-xs text-muted-foreground">{t('dermat_products.fields.required', 'Required')}</span>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={isHidden ? t('dermat_products.fields.show', 'Show field') : t('dermat_products.fields.hide', 'Hide field')}
                        onClick={() => toggle(field.key)}
                      >
                        {isHidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          {suggestions.length ? (
            <section className="space-y-2">
              <SectionTitle>{t('dermat_products.fields.fromOthers', 'Add from other product types')}</SectionTitle>
              <ul className="divide-y rounded-md border">
                {suggestions.map((def) => (
                  <li key={def.key} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span>
                      {def.label}
                      <span className="block text-xs text-muted-foreground">
                        {t('dermat_products.fields.usedOn', 'Used on {kinds}', { kinds: kindLabels(def.fieldsets) })}
                      </span>
                    </span>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => addExisting(def)}>
                      <Plus className="mr-1 h-3 w-3" />
                      {t('dermat_products.fields.add', 'Add')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="space-y-3">
            <SectionTitle>{t('dermat_products.fields.new', 'Create a new field')}</SectionTitle>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('dermat_products.fields.name', 'Field name')}</Label>
              <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="e.g. Viscosity" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('dermat_products.fields.type', 'Type')}</Label>
              <div className="flex gap-2">
                {typeButton('text', t('dermat_products.fields.typeText', 'Text'))}
                {typeButton('number', t('dermat_products.fields.typeNumber', 'Number'))}
                {typeButton('list', t('dermat_products.fields.typeList', 'Choose from list'))}
              </div>
            </div>
            {newType === 'list' ? (
              <div className="space-y-1.5">
                <Label className="text-xs">{t('dermat_products.fields.options', 'Options (one per line)')}</Label>
                <Textarea rows={4} value={newOptions} onChange={(event) => setNewOptions(event.target.value)} placeholder={'Oil soluble\nWater soluble'} />
                <p className="text-xs text-muted-foreground">
                  {t('dermat_products.fields.optionsHint', 'The list is saved in Masters → Dropdown Options, where it can be edited later.')}
                </p>
              </div>
            ) : null}
            {newError ? <p className="text-xs text-destructive">{newError}</p> : null}
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={createField}>
              <Plus className="mr-2 h-4 w-4" />
              {t('dermat_products.fields.create', 'Create field for {kind}', { kind: config.title })}
            </Button>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={saveHidden} disabled={busy}>
            {t('dermat_products.fields.save', 'Save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default FieldsPanel
