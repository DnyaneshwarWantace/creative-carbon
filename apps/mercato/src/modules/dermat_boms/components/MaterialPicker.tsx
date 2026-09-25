"use client"

import * as React from 'react'
import { Plus, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { KIND_CONFIG } from '../../dermat_products/lib/kindConfig'
import type { ProductKind } from '../../dermat_products/lib/kinds'
import type { ComponentOption } from './types'

type MaterialPickerProps = {
  kinds: ProductKind[]
  excludeIds?: string[]
  onSelect: (option: ComponentOption) => void
  label: string
  variant?: 'button' | 'field'
  disabled?: boolean
}

export function formatQty(value: number, digits = 3): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

export function MaterialPicker({ kinds, excludeIds = [], onSelect, label, variant = 'button', disabled }: MaterialPickerProps) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<ComponentOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const kindsKey = kinds.join(',')

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ kinds: kindsKey, limit: '20' })
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<{ items?: ComponentOption[] }>(`/api/dermat_boms/components?${params.toString()}`, undefined, {
        fallback: { items: [] },
      })
      if (cancelled) return
      setOptions(call.result?.items ?? [])
      setActive(0)
      setLoading(false)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, search, kindsKey])

  const visible = options.filter((option) => !excludeIds.includes(option.id))

  const choose = (option: ComponentOption | undefined) => {
    if (!option) return
    onSelect(option)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {variant === 'button' ? (
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Plus className="mr-1.5 h-4 w-4" />
            {label}
          </Button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground"
          >
            <Search className="h-4 w-4" />
            {label}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('dermat_boms.picker.search', 'Search by name or code (e.g. AP-070)')}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((value) => Math.min(value + 1, visible.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((value) => Math.max(value - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(visible[active])
              }
            }}
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1 text-sm">
          {loading && !visible.length ? (
            <li className="px-3 py-2 text-muted-foreground">{t('dermat_boms.picker.loading', 'Searching…')}</li>
          ) : null}
          {!loading && !visible.length ? (
            <li className="px-3 py-2 text-muted-foreground">{t('dermat_boms.picker.empty', 'Nothing found')}</li>
          ) : null}
          {visible.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', index === active && 'bg-muted')}
              >
                <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">{option.code ?? '—'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {KIND_CONFIG[option.kind as ProductKind]?.singular ?? option.kind}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatQty(option.onHand)} {option.unit ?? ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export default MaterialPicker
