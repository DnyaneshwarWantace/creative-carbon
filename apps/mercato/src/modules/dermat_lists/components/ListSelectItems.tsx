"use client"

import * as React from 'react'
import { SelectItem } from '@open-mercato/ui/primitives/select'
import { useListOptions } from './useListOptions'

export function ListSelectItems({ listKey, fallback, current, extra }: { listKey?: string; fallback?: string[]; current?: string | null; extra?: string[] }) {
  const managed = useListOptions(listKey ?? '', current)
  const base = listKey ? managed : [...(fallback ?? []), ...(current && !(fallback ?? []).includes(current) ? [current] : [])]
  const all = [...base, ...(extra ?? []).filter((value) => !base.includes(value))]
  return (
    <>
      {all.map((option) => (
        <SelectItem key={option} value={option}>
          {option}
        </SelectItem>
      ))}
    </>
  )
}

export default ListSelectItems
