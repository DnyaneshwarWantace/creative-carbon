"use client"

import * as React from 'react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'

const EMPTY = '__cc_empty__'

type OptionEntry = { value: string; label: React.ReactNode; disabled: boolean }

type OptionProps = { value?: string | number; children?: React.ReactNode; disabled?: boolean }

function collectOptions(children: React.ReactNode, into: OptionEntry[] = []): OptionEntry[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return
    if (child.type === React.Fragment) {
      collectOptions((child.props as { children?: React.ReactNode }).children, into)
      return
    }
    if (child.type === 'option') {
      const props = child.props as OptionProps
      const value = props.value === undefined ? String(props.children ?? '') : String(props.value)
      into.push({ value, label: props.children, disabled: Boolean(props.disabled) })
    }
  })
  return into
}

export type DropdownChange = { target: { value: string } }

export type DropdownProps = {
  value?: string | number | null
  onChange?: (event: DropdownChange) => void
  children?: React.ReactNode
  className?: string
  disabled?: boolean
  id?: string
  required?: boolean
  size?: 'xs' | 'sm' | 'default' | 'lg'
  placeholder?: string
  'aria-label'?: string
  'aria-invalid'?: boolean
}

export function Dropdown({ value, onChange, children, className, disabled, id, size, placeholder, ...aria }: DropdownProps) {
  const options = collectOptions(children)
  const current = value == null ? '' : String(value)
  const emptyOption = options.find((option) => option.value === '')
  return (
    <Select
      value={current === '' ? (emptyOption ? EMPTY : undefined) : current}
      onValueChange={(next) => onChange?.({ target: { value: next === EMPTY ? '' : next } })}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className={cn('w-full', className)} aria-label={aria['aria-label']} aria-invalid={aria['aria-invalid']}>
        <SelectValue placeholder={placeholder ?? (emptyOption?.label as string | undefined) ?? '—'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value === '' ? EMPTY : option.value} value={option.value === '' ? EMPTY : option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default Dropdown
