"use client"

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DEPARTMENT_LABELS, stripInternal, type QcParameter, type StageDefinitionView, type StageField, type StageFieldType } from './types'

const FIELD_TYPES: Array<{ value: StageFieldType; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Tick box' },
]

function toKey(label: string, existing: string[]): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f_$1') || 'field'
  let key = base
  let counter = 2
  while (existing.includes(key)) key = `${base}_${counter++}`
  return key
}

type StageDefinitionSheetProps = {
  definition: StageDefinitionView | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function StageDefinitionSheet({ definition, onOpenChange, onSaved }: StageDefinitionSheetProps) {
  const t = useT()
  const [name, setName] = React.useState('')
  const [department, setDepartment] = React.useState('')
  const [isOptional, setIsOptional] = React.useState(false)
  const [isActive, setIsActive] = React.useState(true)
  const [fields, setFields] = React.useState<StageField[]>([])
  const [optionDrafts, setOptionDrafts] = React.useState<Record<number, string>>({})
  const [qcParameters, setQcParameters] = React.useState<QcParameter[]>([])
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const mutationContextId = 'dermat_workflow.stage-definition-sheet'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({ contextId: mutationContextId })

  React.useEffect(() => {
    if (!definition) return
    setName(definition.name)
    setDepartment(definition.department)
    setIsOptional(definition.isOptional)
    setIsActive(definition.isActive)
    setFields(definition.fields.map((field) => ({ ...field })))
    setOptionDrafts(Object.fromEntries(definition.fields.map((field, index) => [index, (field.options ?? []).join(', ')])))
    setQcParameters((definition.config?.qcParameters ?? []).map((parameter) => ({ ...parameter })))
    setError(null)
  }, [definition])

  const updateField = (index: number, patch: Partial<StageField>) =>
    setFields((current) => current.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)))

  const addField = () => {
    setFields((current) => [...current, { key: '', label: '', type: 'text', required: false }])
  }

  const save = async () => {
    if (!definition) return
    if (!name.trim()) {
      setError(t('dermat_workflow.stages.nameRequired', 'Stage name is required.'))
      return
    }
    const usedKeys: string[] = []
    const cleanFields: StageField[] = []
    for (const [index, field] of fields.entries()) {
      if (!field.label.trim()) continue
      const key = field.key || toKey(field.label, usedKeys)
      usedKeys.push(key)
      const options =
        field.type === 'select'
          ? (optionDrafts[index] ?? '')
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean)
          : undefined
      if (field.type === 'select' && !options?.length) {
        setError(t('dermat_workflow.stages.optionsRequired', 'Add the choices for dropdown "{label}" (comma separated).', { label: field.label }))
        return
      }
      cleanFields.push({ key, label: field.label.trim(), type: field.type, required: Boolean(field.required), options, unit: field.unit ?? null })
    }
    const payload = {
      id: definition.id,
      name: name.trim(),
      department,
      isOptional,
      isActive,
      fields: cleanFields,
      config: definition.kind === 'qc_test' ? { qcParameters: qcParameters.filter((parameter) => parameter.parameter.trim()) } : definition.config,
    }
    setSaving(true)
    setError(null)
    try {
      const call = await runMutation({
        operation: async () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(definition.updatedAt), () =>
            apiCall<{ ok?: boolean; error?: string }>('/api/dermat_workflow/definitions', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }),
          ),
        context: { formId: mutationContextId, resourceKind: 'dermat_workflow.stage_definition', resourceId: definition.id, retryLastMutation },
        mutationPayload: payload,
      })
      if (!call.ok) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.stages.saveError', 'Could not save the stage.')))
        return
      }
      flash(t('dermat_workflow.stages.saved', 'Stage saved.'), 'success')
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={Boolean(definition)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="sm:max-w-2xl w-full overflow-y-auto"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !saving) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>{t('dermat_workflow.stages.edit', 'Edit stage')}</SheetTitle>
          <SheetDescription>
            {definition?.phaseLabel
              ? t('dermat_workflow.stages.productionStage', 'Production stage · {phase}', { phase: definition.phaseLabel })
              : t('dermat_workflow.stages.orderStage', 'Order stage')}
          </SheetDescription>
        </SheetHeader>
        {definition ? (
          <div className="flex-1 space-y-5 px-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="stage-name">{t('dermat_workflow.stages.name', 'Stage name *')}</Label>
                <Input id="stage-name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="stage-department">{t('dermat_workflow.stages.department', 'Department that does this stage')}</Label>
                <Select value={department} onValueChange={setDepartment}>
                  <SelectTrigger id="stage-department">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DEPARTMENT_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {!definition.isAutomatic ? (
              <div className="space-y-3">
                <SwitchField
                  label={t('dermat_workflow.stages.optional', 'Optional stage')}
                  description={t('dermat_workflow.stages.optionalHelp', 'Users can mark it "not required" and skip it for an order.')}
                  checked={isOptional}
                  onCheckedChange={setIsOptional}
                />
                <SwitchField
                  label={t('dermat_workflow.stages.active', 'Stage in use')}
                  description={t('dermat_workflow.stages.activeHelp', 'Switched-off stages are left out of new work.')}
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            ) : (
              <Notice compact message={t('dermat_workflow.stages.automaticHelp', 'Production completes automatically when every product finishes Packing. Configure the Manufacturing / Filling / Packing stages instead.')} />
            )}

            {!definition.isAutomatic ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t('dermat_workflow.stages.fields', 'Form fields')}</div>
                  <Button type="button" variant="outline" size="sm" onClick={addField}>
                    <Plus className="size-4" aria-hidden />
                    {t('dermat_workflow.stages.addField', 'Add field')}
                  </Button>
                </div>
                {fields.map((field, index) => (
                  <div key={index} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <Input
                        className="flex-1"
                        placeholder={t('dermat_workflow.stages.fieldLabel', 'Field label')}
                        value={field.label}
                        onChange={(event) => updateField(index, { label: event.target.value })}
                      />
                      <Select value={field.type} onValueChange={(value) => updateField(index, { type: value as StageFieldType })}>
                        <SelectTrigger className="w-36" aria-label={t('dermat_workflow.stages.fieldType', 'Field type')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <IconButton
                        type="button"
                        variant="ghost"
                        aria-label={t('dermat_workflow.stages.removeField', 'Remove field')}
                        onClick={() => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </IconButton>
                    </div>
                    {field.type === 'select' ? (
                      <Input
                        placeholder={t('dermat_workflow.stages.options', 'Choices, comma separated')}
                        value={optionDrafts[index] ?? ''}
                        onChange={(event) => setOptionDrafts((current) => ({ ...current, [index]: event.target.value }))}
                      />
                    ) : null}
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox checked={Boolean(field.required)} onCheckedChange={(checked) => updateField(index, { required: checked === true })} />
                      {t('dermat_workflow.stages.required', 'Required before the stage can be completed')}
                    </label>
                  </div>
                ))}
              </div>
            ) : null}

            {definition.kind === 'qc_test' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{t('dermat_workflow.stages.qcParameters', 'QC parameters tested at this stage')}</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQcParameters((current) => [...current, { parameter: '', classification: 'Critical', specification: '' }])}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t('dermat_workflow.stages.addParameter', 'Add parameter')}
                  </Button>
                </div>
                {qcParameters.map((parameter, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <Input
                      className="flex-1"
                      placeholder={t('dermat_workflow.stages.parameter', 'Parameter (e.g. pH)')}
                      value={parameter.parameter}
                      onChange={(event) =>
                        setQcParameters((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, parameter: event.target.value } : item)))
                      }
                    />
                    <Select
                      value={parameter.classification || 'Critical'}
                      onValueChange={(value) =>
                        setQcParameters((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, classification: value } : item)))
                      }
                    >
                      <SelectTrigger className="w-28" aria-label={t('dermat_workflow.stages.class', 'Class')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['Critical', 'Major', 'Minor'].map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      className="flex-1"
                      placeholder={t('dermat_workflow.stages.specification', 'Specification (e.g. 5.5–6.5)')}
                      value={parameter.specification}
                      onChange={(event) =>
                        setQcParameters((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, specification: event.target.value } : item)))
                      }
                    />
                    <IconButton
                      type="button"
                      variant="ghost"
                      aria-label={t('dermat_workflow.stages.removeParameter', 'Remove parameter')}
                      onClick={() => setQcParameters((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </IconButton>
                  </div>
                ))}
              </div>
            ) : null}
            {error ? <Notice variant="error" message={error} /> : null}
          </div>
        ) : null}
        <SheetFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('dermat_workflow.sheet.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner /> : null}
            {t('dermat_workflow.stages.save', 'Save stage')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
