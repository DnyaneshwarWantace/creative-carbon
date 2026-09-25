"use client"

import * as React from 'react'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { CheckboxField } from '@open-mercato/ui/primitives/checkbox-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { QcRowValue, StageDefinitionView, StageField } from './types'

type StageFormProps = {
  definition: StageDefinitionView
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  readOnly?: boolean
  missing?: string[]
}

export function buildQcRows(definition: StageDefinitionView, values: Record<string, unknown>): QcRowValue[] {
  const saved = Array.isArray(values.qc_rows) ? (values.qc_rows as QcRowValue[]) : []
  if (saved.length) return saved
  return (definition.config?.qcParameters ?? []).map((parameter) => ({
    parameter: parameter.parameter,
    classification: parameter.classification,
    specification: parameter.specification,
    observation: '',
    remark: '',
    result: '',
  }))
}

function FieldInput({
  field,
  value,
  onValue,
  readOnly,
  invalid,
}: {
  field: StageField
  value: unknown
  onValue: (value: unknown) => void
  readOnly?: boolean
  invalid?: boolean
}) {
  const t = useT()
  const id = `stage-field-${field.key}`
  if (field.type === 'checkbox') {
    return (
      <CheckboxField
        id={id}
        label={`${field.label}${field.required ? ' *' : ''}`}
        checked={value === true}
        disabled={readOnly}
        onCheckedChange={(checked) => onValue(checked === true)}
        aria-invalid={invalid || undefined}
      />
    )
  }
  const label = (
    <Label htmlFor={id}>
      {field.label}
      {field.unit ? ` (${field.unit})` : ''}
      {field.required ? ' *' : ''}
    </Label>
  )
  const text = value === null || value === undefined ? '' : String(value)
  if (field.type === 'select') {
    return (
      <div className="space-y-1.5">
        {label}
        <Select value={text || undefined} onValueChange={(next) => onValue(next)} disabled={readOnly}>
          <SelectTrigger id={id} aria-invalid={invalid || undefined}>
            <SelectValue placeholder={t('dermat_workflow.form.select', 'Select…')} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }
  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        {label}
        <Textarea
          id={id}
          value={text}
          readOnly={readOnly}
          aria-invalid={invalid || undefined}
          onChange={(event) => onValue(event.target.value)}
        />
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {label}
      <Input
        id={id}
        type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
        value={text}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const raw = event.target.value
          if (field.type === 'number') onValue(raw === '' ? null : Number(raw))
          else onValue(raw)
        }}
      />
    </div>
  )
}

function QcTable({
  rows,
  onRows,
  readOnly,
}: {
  rows: QcRowValue[]
  onRows: (rows: QcRowValue[]) => void
  readOnly?: boolean
}) {
  const t = useT()
  const update = (index: number, patch: Partial<QcRowValue>) => {
    onRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)))
  }
  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold">{t('dermat_workflow.qc.title', 'QC parameters')}</div>
      {rows.map((row, index) => (
        <div key={`${row.parameter}-${index}`} className="rounded-md border border-border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-medium">{row.parameter}</div>
              <div className="text-xs text-muted-foreground">
                {row.classification}
                {row.specification ? ` · ${t('dermat_workflow.qc.spec', 'Spec')}: ${row.specification}` : ''}
              </div>
            </div>
            <Select
              value={row.result || undefined}
              onValueChange={(next) => update(index, { result: next === 'pass' || next === 'fail' ? next : '' })}
              disabled={readOnly}
            >
              <SelectTrigger className="w-28" aria-label={t('dermat_workflow.qc.result', 'Result')}>
                <SelectValue placeholder={t('dermat_workflow.qc.result', 'Result')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pass">{t('dermat_workflow.qc.pass', 'Pass')}</SelectItem>
                <SelectItem value="fail">{t('dermat_workflow.qc.fail', 'Fail')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Input
              placeholder={t('dermat_workflow.qc.observation', 'Observation *')}
              value={row.observation}
              readOnly={readOnly}
              onChange={(event) => update(index, { observation: event.target.value })}
            />
            <Input
              placeholder={t('dermat_workflow.qc.remark', 'Remark')}
              value={row.remark}
              readOnly={readOnly}
              onChange={(event) => update(index, { remark: event.target.value })}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StageForm({ definition, values, onChange, readOnly, missing = [] }: StageFormProps) {
  const t = useT()
  const setValue = (key: string, value: unknown) => onChange({ ...values, [key]: value })
  const missingSet = new Set(missing)
  return (
    <div className="space-y-4">
      {definition.fields.map((field) => (
        <FieldInput
          key={field.key}
          field={field}
          value={values[field.key]}
          onValue={(value) => setValue(field.key, value)}
          readOnly={readOnly}
          invalid={missingSet.has(field.label)}
        />
      ))}
      {definition.kind === 'qc_test' ? (
        <>
          <QcTable rows={buildQcRows(definition, values)} onRows={(rows) => setValue('qc_rows', rows)} readOnly={readOnly} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stage-field-tested_by">{t('dermat_workflow.qc.testedBy', 'Tested by *')}</Label>
              <Input
                id="stage-field-tested_by"
                value={typeof values.tested_by === 'string' ? values.tested_by : ''}
                readOnly={readOnly}
                onChange={(event) => setValue('tested_by', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stage-field-ar_number">{t('dermat_workflow.qc.arNumber', 'A.R. / report number')}</Label>
              <Input
                id="stage-field-ar_number"
                value={typeof values.ar_number === 'string' ? values.ar_number : ''}
                readOnly={readOnly}
                onChange={(event) => setValue('ar_number', event.target.value)}
              />
            </div>
          </div>
        </>
      ) : null}
      {!definition.fields.length && definition.kind === 'form' ? (
        <p className="text-sm text-muted-foreground">
          {t('dermat_workflow.form.noFields', 'No fields are configured for this stage. An admin can add them under Settings → Workflow Stages.')}
        </p>
      ) : null}
    </div>
  )
}
