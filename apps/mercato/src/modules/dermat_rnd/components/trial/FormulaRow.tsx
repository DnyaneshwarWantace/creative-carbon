"use client"

import * as React from 'react'
import { Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { SuggestInput } from '../../../dermat_lists/components/SuggestInput'
import { MaterialPicker } from '../../../dermat_boms/components/MaterialPicker'
import { numberText } from '../labels'
import type { FormulaLine } from '../types'

type FormulaRowProps = {
  line: FormulaLine
  balance: number
  quantity: number | null
  unit: string
  onChange: (line: FormulaLine) => void
  onRemove: () => void
}

export function FormulaRow({ line, balance, quantity, unit, onChange, onRemove }: FormulaRowProps) {
  const t = useT()
  return (
    <tr className="border-t align-top">
      <td className="w-40 px-2 py-1.5">
        <SuggestInput id={`phase-${line.id}`} listKey="rnd_formula_phases" className="h-8" value={line.phase ?? ''} aria-label={t('dermat_rnd.formula.phase', 'Phase')} onChange={(event) => onChange({ ...line, phase: event.target.value })} />
      </td>
      <td className="min-w-64 px-2 py-1.5">
        {line.productId ? (
          <MaterialPicker kinds={['raw_material', 'bulk']} variant="field" label={[line.code, line.name].filter(Boolean).join(' · ')} onSelect={(option) => onChange({ ...line, productId: option.id, code: option.code, name: option.title })} />
        ) : (
          <div className="flex flex-col gap-1">
            <Input id={`name-${line.id}`} className="h-8" value={line.name} placeholder={t('dermat_rnd.formula.freeName', 'Ingredient not in the RM list')} aria-label={t('dermat_rnd.formula.material', 'Material')} onChange={(event) => onChange({ ...line, name: event.target.value })} />
            <MaterialPicker kinds={['raw_material', 'bulk']} label={t('dermat_rnd.formula.link', 'Link to RM list')} onSelect={(option) => onChange({ ...line, productId: option.id, code: option.code, name: option.title })} />
          </div>
        )}
      </td>
      <td className="w-40 px-2 py-1.5">
        <SuggestInput id={`function-${line.id}`} listKey="rnd_ingredient_functions" className="h-8" value={line.function ?? ''} aria-label={t('dermat_rnd.formula.function', 'Function')} onChange={(event) => onChange({ ...line, function: event.target.value })} />
      </td>
      <td className="w-28 px-2 py-1.5">
        <Input
          id={`percent-${line.id}`}
          className="h-8 text-right tabular-nums"
          type="number"
          step="0.001"
          min="0"
          max="100"
          disabled={line.isBalance}
          value={line.isBalance ? balance : line.percent}
          aria-label={t('dermat_rnd.formula.percent', '% w/w')}
          onChange={(event) => onChange({ ...line, percent: Number(event.target.value) })}
        />
      </td>
      <td className="w-16 px-2 py-1.5 text-center">
        <Checkbox checked={line.isBalance} aria-label={t('dermat_rnd.formula.qs', 'Balance (q.s. to 100)')} onCheckedChange={(checked) => onChange({ ...line, isBalance: checked === true })} />
      </td>
      <td className="w-28 whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">{quantity == null ? '—' : `${numberText(quantity)} ${unit}`}</td>
      <td className="w-10 px-1 py-1.5">
        <IconButton type="button" variant="ghost" size="sm" aria-label={t('dermat_rnd.formula.remove', 'Remove line')} onClick={onRemove}>
          <Trash2 className="size-4" />
        </IconButton>
      </td>
    </tr>
  )
}
