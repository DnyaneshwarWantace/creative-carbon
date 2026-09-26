"use client"

import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useListOptions } from '../../dermat_lists/components/useListOptions'
import { SuggestInput } from '../../dermat_lists/components/SuggestInput'

export type EditKind = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea'
export type EditOption = string | { value: string; label: string }

type Props = {
  kind: EditKind
  value: string
  options?: EditOption[]
  listKey?: string
  dirty?: boolean
  align?: 'right' | 'center'
  onChange: (value: string) => void
}

const NONE = '__none'

export function EditField({ kind, value, options, listKey, dirty, align, onChange }: Props) {
  const managed = useListOptions(listKey ?? '')
  const tone = dirty ? 'border-status-warning-border bg-status-warning-bg' : 'bg-background'
  if (kind === 'select') {
    const list = (listKey ? managed : options ?? []).map((option) => (typeof option === 'string' ? { value: option, label: option } : option))
    return (
      <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
        <SelectTrigger className={cn('h-7 min-w-32 text-xs', tone)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {list.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          {value && !list.some((option) => option.value === value) ? <SelectItem value={value}>{value}</SelectItem> : null}
        </SelectContent>
      </Select>
    )
  }
  if (kind === 'textarea') {
    return <Textarea rows={2} value={value} className={cn('min-w-56 text-xs', tone)} onChange={(event) => onChange(event.target.value)} />
  }
  if (kind === 'text' && listKey) {
    return <SuggestInput listKey={listKey} value={value} className={cn('h-7 min-w-36 text-xs', align === 'right' && 'text-right', tone)} onChange={(event) => onChange(event.target.value)} />
  }
  return (
    <Input
      type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text'}
      step={kind === 'number' ? 'any' : undefined}
      value={value}
      className={cn('h-7 text-xs', kind === 'number' ? 'w-28' : kind === 'date' ? 'w-36' : 'min-w-36', (align === 'right' || kind === 'number') && 'text-right', tone)}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export default EditField
