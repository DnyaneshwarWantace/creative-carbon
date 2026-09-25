"use client"

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'

export type UnitOption = { value: string; label: string }

export type UnitConversionDraft = { id?: string; unitCode: string; toBaseFactor: string }

export type UnitsValue = {
  baseUnit: string
  purchaseUnit: string
  conversions: UnitConversionDraft[]
}

type UnitTableProps = {
  value: UnitsValue
  units: UnitOption[]
  onChange: (next: UnitsValue) => void
  error?: string
}

export function UnitTable({ value, units, onChange, error }: UnitTableProps) {
  const t = useT()
  const labelFor = (code: string) => units.find((unit) => unit.value === code)?.label ?? code
  const usedCodes = new Set([value.baseUnit, ...value.conversions.map((row) => row.unitCode)])
  const productUnits = [value.baseUnit, ...value.conversions.map((row) => row.unitCode)].filter(Boolean)

  const updateRow = (index: number, patch: Partial<UnitConversionDraft>) => {
    const conversions = value.conversions.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    onChange({ ...value, conversions })
  }

  const removeRow = (index: number) => {
    const removed = value.conversions[index]?.unitCode
    const conversions = value.conversions.filter((_, rowIndex) => rowIndex !== index)
    const purchaseUnit = removed && removed === value.purchaseUnit ? value.baseUnit : value.purchaseUnit
    onChange({ ...value, conversions, purchaseUnit })
  }

  const addRow = () => {
    const next = units.find((unit) => !usedCodes.has(unit.value))
    onChange({ ...value, conversions: [...value.conversions, { unitCode: next?.value ?? '', toBaseFactor: '' }] })
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>{t('dermat_products.units.base', 'Stock Unit')} *</Label>
          <Select
            value={value.baseUnit}
            onValueChange={(baseUnit) =>
              onChange({
                ...value,
                baseUnit,
                purchaseUnit: value.purchaseUnit === value.baseUnit ? baseUnit : value.purchaseUnit,
                conversions: value.conversions.filter((row) => row.unitCode !== baseUnit),
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t('dermat_products.units.select', 'Select unit')} />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={unit.value} value={unit.value}>
                  {unit.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('dermat_products.units.baseHint', 'Stock is always kept in this unit.')}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>{t('dermat_products.units.purchase', 'Purchase Unit')}</Label>
          <Select value={value.purchaseUnit} onValueChange={(purchaseUnit) => onChange({ ...value, purchaseUnit })}>
            <SelectTrigger>
              <SelectValue placeholder={t('dermat_products.units.select', 'Select unit')} />
            </SelectTrigger>
            <SelectContent>
              {productUnits.map((code) => (
                <SelectItem key={code} value={code}>
                  {labelFor(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('dermat_products.units.other', 'Other Units')}</Label>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t('dermat_products.units.unit', 'Unit')}</th>
                <th className="px-3 py-2 font-medium">
                  {t('dermat_products.units.ratio', '1 unit = how many {base}', { base: labelFor(value.baseUnit) })}
                </th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {value.conversions.map((row, index) => (
                <tr key={`${row.unitCode}-${index}`} className="border-t">
                  <td className="px-3 py-2">
                    <Select value={row.unitCode} onValueChange={(unitCode) => updateRow(index, { unitCode })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('dermat_products.units.select', 'Select unit')} />
                      </SelectTrigger>
                      <SelectContent>
                        {units
                          .filter((unit) => unit.value === row.unitCode || !usedCodes.has(unit.value))
                          .map((unit) => (
                            <SelectItem key={unit.value} value={unit.value}>
                              {unit.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="any"
                      value={row.toBaseFactor}
                      onChange={(event) => updateRow(index, { toBaseFactor: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t('dermat_products.units.remove', 'Remove unit')}
                      onClick={() => removeRow(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {value.conversions.length === 0 ? (
                <tr className="border-t">
                  <td colSpan={3} className="px-3 py-3 text-xs text-muted-foreground">
                    {t('dermat_products.units.none', 'No other units. Stock and documents use the stock unit only.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-2 h-4 w-4" />
          {t('dermat_products.units.add', 'Add unit')}
        </Button>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </div>
  )
}
