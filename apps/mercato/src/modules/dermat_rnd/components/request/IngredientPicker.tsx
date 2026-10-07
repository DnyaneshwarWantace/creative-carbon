"use client"

import * as React from 'react'
import { X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { MaterialPicker } from '../../../dermat_boms/components/MaterialPicker'
import type { IngredientRef } from '../types'

type IngredientPickerProps = { value: IngredientRef[]; onChange: (value: IngredientRef[]) => void }

export function IngredientPicker({ value, onChange }: IngredientPickerProps) {
  const t = useT()
  return (
    <div className="flex flex-col gap-2">
      {value.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li key={item.productId} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2.5 pr-0.5 text-xs">
              {item.code ? <span className="font-mono text-muted-foreground">{item.code}</span> : null}
              <span>{item.name}</span>
              <IconButton
                type="button"
                variant="ghost"
                size="xs"
                fullRadius
                aria-label={t('dermat_rnd.form.removeIngredient', 'Remove {name}', { name: item.name })}
                onClick={() => onChange(value.filter((entry) => entry.productId !== item.productId))}
              >
                <X className="size-3" />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      <MaterialPicker
        kinds={['raw_material']}
        excludeIds={value.map((item) => item.productId)}
        label={t('dermat_rnd.form.addIngredient', 'Add ingredient from the RM list')}
        onSelect={(option) => onChange([...value, { productId: option.id, code: option.code, name: option.title }])}
      />
    </div>
  )
}
