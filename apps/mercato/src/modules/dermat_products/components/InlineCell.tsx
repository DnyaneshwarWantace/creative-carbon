"use client"

import * as React from 'react'
import { Check, Lock, Pencil } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'

export type InlineKind = 'text' | 'number' | 'date' | 'time' | 'select' | 'textarea'

type Props = {
  display: React.ReactNode
  value: string
  kind: InlineKind
  options?: string[]
  locked?: string | null
  align?: 'right' | 'center'
  onSave: (value: string) => Promise<boolean>
}

const NONE = '__none'

export function InlineCell({ display, value, kind, options, locked, align, onSave }: Props) {
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(value)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  React.useEffect(() => {
    if (!saved) return
    const handle = window.setTimeout(() => setSaved(false), 1500)
    return () => window.clearTimeout(handle)
  }, [saved])

  const commit = async (next: string) => {
    if (next.trim() === value.trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    const ok = await onSave(next)
    setSaving(false)
    if (ok) {
      setEditing(false)
      setSaved(true)
    }
  }

  const stop = (event: React.SyntheticEvent) => event.stopPropagation()

  if (locked) {
    return (
      <span title={locked} className="group/cell inline-flex items-center gap-1">
        <span>{display}</span>
        <Lock className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" aria-label={locked} />
      </span>
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(event) => {
          stop(event)
          setDraft(value)
          setEditing(true)
        }}
        className={cn(
          'group/cell -mx-1 inline-flex min-h-6 w-full items-center gap-1 rounded-sm border border-transparent px-1 text-left transition-colors hover:border-input hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          align === 'right' && 'justify-end text-right',
          align === 'center' && 'justify-center',
        )}
      >
        <span className="min-w-0">{display}</span>
        {saving ? <Spinner size="sm" /> : saved ? <Check className="h-3 w-3 shrink-0 text-status-success-icon" aria-hidden="true" /> : <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100" aria-hidden="true" />}
      </button>
    )
  }

  if (kind === 'select') {
    return (
      <span onClick={stop} className="inline-flex min-w-36 items-center gap-1">
        <Select
          defaultOpen
          value={draft || NONE}
          onOpenChange={(open) => {
            if (!open && !saving) setEditing(false)
          }}
          onValueChange={(next) => {
            const chosen = next === NONE ? '' : next
            setDraft(chosen)
            void commit(chosen)
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving ? <Spinner size="sm" /> : null}
      </span>
    )
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(value)
      setEditing(false)
    }
    if (event.key === 'Enter' && (kind !== 'textarea' || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void commit(draft)
    }
  }

  if (kind === 'textarea') {
    return (
      <span onClick={stop} className="block min-w-60">
        <Textarea autoFocus rows={3} value={draft} disabled={saving} className="text-xs" onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} onBlur={() => void commit(draft)} />
      </span>
    )
  }

  return (
    <span onClick={stop} className="inline-flex items-center gap-1">
      <Input
        autoFocus
        type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : kind === 'time' ? 'time' : 'text'}
        step={kind === 'number' ? 'any' : undefined}
        value={draft}
        disabled={saving}
        className={cn('h-7 min-w-28 text-xs', kind === 'number' && 'w-28 text-right')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void commit(draft)}
      />
      {saving ? <Spinner size="sm" /> : null}
    </span>
  )
}

export default InlineCell
