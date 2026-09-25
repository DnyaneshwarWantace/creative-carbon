"use client"

import * as React from 'react'
import { ChevronsUpDown, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Input } from '@open-mercato/ui/primitives/input'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'

export type PickerOption<T> = { id: string; primary: string; secondary?: string | null; tag?: string | null; value: T }

type SearchPickerProps<T> = {
  value: PickerOption<T> | null
  placeholder: string
  searchPlaceholder: string
  load: (search: string) => Promise<PickerOption<T>[]>
  onSelect: (option: PickerOption<T>) => void
  disabled?: boolean
  invalid?: boolean
  footer?: React.ReactNode
}

export function SearchPicker<T>({ value, placeholder, searchPlaceholder, load, onSelect, disabled, invalid, footer }: SearchPickerProps<T>) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const [options, setOptions] = React.useState<PickerOption<T>[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const loadRef = React.useRef(load)
  loadRef.current = load

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const handle = window.setTimeout(async () => {
      const result = await loadRef.current(search.trim())
      if (cancelled) return
      setOptions(result)
      setActive(0)
      setLoading(false)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [open, search])

  const choose = (option: PickerOption<T> | undefined) => {
    if (!option) return
    onSelect(option)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm disabled:opacity-60',
            invalid && 'border-status-error-border',
          )}
        >
          {value ? (
            <span className="min-w-0 truncate">
              {value.tag ? <span className="mr-2 font-mono text-xs text-muted-foreground">{value.tag}</span> : null}
              {value.primary}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Search className="h-4 w-4" />
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-80 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((current) => Math.min(current + 1, options.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current) => Math.max(current - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                choose(options[active])
              }
            }}
          />
        </div>
        <ul className="max-h-72 overflow-auto py-1 text-sm">
          {loading && !options.length ? <li className="px-3 py-2 text-muted-foreground">{t('dermat_orders.picker.loading', 'Searching…')}</li> : null}
          {!loading && !options.length ? <li className="px-3 py-2 text-muted-foreground">{t('dermat_orders.picker.empty', 'Nothing found')}</li> : null}
          {options.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
                className={cn('flex w-full items-center gap-3 px-3 py-2 text-left', index === active && 'bg-muted')}
              >
                {option.tag !== undefined ? <span className="w-24 shrink-0 truncate font-mono text-xs text-muted-foreground">{option.tag ?? '—'}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.primary}</span>
                  {option.secondary ? <span className="block truncate text-xs text-muted-foreground">{option.secondary}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {footer ? <div className="border-t p-2">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  )
}

export default SearchPicker
