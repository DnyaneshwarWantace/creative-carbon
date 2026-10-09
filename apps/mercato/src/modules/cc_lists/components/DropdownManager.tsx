"use client"

import * as React from 'react'
import { ArrowDown, ArrowUp, Lock, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { invalidateListOptions } from './useListOptions'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Option = { value: string; active: boolean; locked: boolean }
type ListView = { key: string; label: string; department: string; usedIn: string; fixed: string | null; customised: boolean; options: Option[]; updatedAt: string | null; updatedByName: string | null }
type Draft = Option & { id: number; original: string | null }

const DEPARTMENT_ORDER = ['Sales', 'Accounts', 'Purchase', 'Store', 'Production', 'QC', 'Masters']

let draftCounter = 0
function toDrafts(options: Option[]): Draft[] {
  return options.map((option) => {
    draftCounter += 1
    return { ...option, id: draftCounter, original: option.value }
  })
}

function sameDrafts(drafts: Draft[], options: Option[]): boolean {
  return drafts.length === options.length && drafts.every((draft, index) => draft.value.trim() === options[index].value && draft.active === options[index].active)
}

export function DropdownManager({ only, title, lede }: { only?: string[]; title?: string; lede?: string } = {}) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-dropdown-manager' })
  const [lists, setLists] = React.useState<ListView[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Draft[]>([])
  const [newValue, setNewValue] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [confirmReset, setConfirmReset] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items?: ListView[]; error?: string }>('/api/cc_lists/lists')
    if (!call.ok) {
      setLoadError(call.result?.error ?? t('cc_lists.loadError', 'Could not load the dropdown lists.'))
      return
    }
    const items = call.result?.items ?? []
    setLists(only ? items.filter((item) => only.includes(item.key)) : items)
  }, [t, only])

  React.useEffect(() => {
    void load()
  }, [load])

  const selected = lists?.find((list) => list.key === selectedKey) ?? null

  React.useEffect(() => {
    if (!lists?.length) return
    if (!selectedKey) setSelectedKey(lists[0].key)
  }, [lists, selectedKey])

  React.useEffect(() => {
    if (selected) setDrafts(toDrafts(selected.options))
    setNewValue('')
    setConfirmReset(false)
  }, [selected])

  const dirty = selected ? !sameDrafts(drafts, selected.options) : false

  const pick = (key: string) => {
    if (dirty && key !== selectedKey) {
      flash(t('cc_lists.unsaved', 'Save or undo the changes to {list} first.', { list: selected?.label ?? '' }), 'error')
      return
    }
    setSelectedKey(key)
  }

  const addValue = () => {
    const value = newValue.replace(/\s+/g, ' ').trim()
    if (!value) return
    if (drafts.some((draft) => draft.value.trim().toLowerCase() === value.toLowerCase())) {
      flash(t('cc_lists.duplicate', '"{value}" is already in the list.', { value }), 'error')
      return
    }
    draftCounter += 1
    setDrafts((prev) => [...prev, { id: draftCounter, value, active: true, locked: false, original: null }])
    setNewValue('')
  }

  const move = (index: number, delta: number) => {
    setDrafts((prev) => {
      const next = [...prev]
      const target = index + delta
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const send = async (body: Record<string, unknown>, success: string) => {
    if (!selected) return
    setSaving(true)
    try {
      const request = () => apiCall<ListView & { error?: string }>('/api/cc_lists/lists', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'cc_lists.list', resourceId: selected.key },
        mutationPayload: body,
        operation: () => (selected.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(selected.updatedAt), request) : request()),
      })
      if (!call.ok || !call.result) {
        const conflict = call.status === 409 && (call.result as { error?: string } | null)?.error === 'record_modified'
        flash(conflict ? t('cc_lists.conflict', 'Someone else changed this list. Reload to see their version.') : (call.result?.error ?? t('cc_lists.saveError', 'Could not save the list.')), 'error')
        return
      }
      const saved = call.result
      setLists((prev) => (prev ? prev.map((list) => (list.key === saved.key ? saved : list)) : prev))
      invalidateListOptions()
      flash(success, 'success')
    } finally {
      setSaving(false)
    }
  }

  const save = () => {
    if (!selected) return
    const empty = drafts.find((draft) => !draft.value.trim())
    if (empty) {
      flash(t('cc_lists.empty', 'A choice cannot be blank. Type a name or delete the row.'), 'error')
      return
    }
    void send({ key: selected.key, options: drafts.map((draft) => ({ value: draft.value, active: draft.active })) }, t('cc_lists.saved', '{list} saved', { list: selected.label }))
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!lists) {
    return (
      <Page>
        <PageBody>
          <PageLoading label={t('cc_lists.loading', 'Loading dropdown lists…')} />
        </PageBody>
      </Page>
    )
  }

  const term = search.trim().toLowerCase()
  const visible = lists.filter((list) => !term || list.label.toLowerCase().includes(term) || list.usedIn.toLowerCase().includes(term) || list.options.some((option) => option.value.toLowerCase().includes(term)))
  const groups = DEPARTMENT_ORDER.map((department) => ({ department, items: visible.filter((list) => list.department === department) })).filter((group) => group.items.length)
  const renamed = drafts.filter((draft) => draft.original && draft.original !== draft.value.trim())

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{title ?? t('cc_lists.title', 'Dropdown lists')}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {lede ?? t('cc_lists.lede', 'Every choice list used across the ERP, by department. Add, rename, reorder or switch off choices here and every form picks them up. Old records keep the value they were saved with.')}
            </p>
          </header>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <nav className="space-y-4 lg:col-span-4" aria-label={t('cc_lists.navLabel', 'Lists')}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_lists.search', 'Find a list or a choice')} className="pl-9" aria-label={t('cc_lists.search', 'Find a list or a choice')} />
              </div>
              {groups.length ? (
                groups.map((group) => (
                  <div key={group.department} className="space-y-1">
                    <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.department}</p>
                    <ul className="space-y-0.5">
                      {group.items.map((list) => (
                        <li key={list.key}>
                          <button
                            type="button"
                            onClick={() => pick(list.key)}
                            aria-current={list.key === selectedKey ? 'true' : undefined}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                              list.key === selectedKey && 'bg-muted font-medium',
                            )}
                          >
                            <span className="truncate">{list.label}</span>
                            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                              {list.fixed ? <Lock className="h-3 w-3" aria-label={t('cc_lists.fixedShort', 'Fixed')} /> : null}
                              {list.customised ? <StatusBadge variant="info">{t('cc_lists.edited', 'Edited')}</StatusBadge> : null}
                              <span className="tabular-nums">{list.options.filter((option) => option.active).length}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <p className="px-2 text-sm text-muted-foreground">{t('cc_lists.noMatch', 'No list matches "{term}".', { term: search })}</p>
              )}
            </nav>

            {selected ? (
              <section className="space-y-4 rounded-lg border bg-card p-5 lg:col-span-8" aria-labelledby="dropdown-list-title">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <h2 id="dropdown-list-title" className="text-lg font-semibold">
                      {selected.label}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t('cc_lists.usedIn', 'Used in: {where}', { where: selected.usedIn })}</p>
                    {selected.updatedAt ? (
                      <p className="text-xs text-muted-foreground">
                        {t('cc_lists.lastChange', 'Last changed {date}{by}', {
                          date: new Date(selected.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                          by: selected.updatedByName ? ` by ${selected.updatedByName}` : '',
                        })}
                      </p>
                    ) : null}
                  </div>
                  {!selected.fixed ? (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {selected.customised ? (
                        confirmReset ? (
                          <Button type="button" variant="destructive" size="sm" disabled={saving} onClick={() => void send({ key: selected.key, reset: true }, t('cc_lists.resetDone', '{list} is back to the standard choices', { list: selected.label }))}>
                            {t('cc_lists.resetConfirm', 'Yes, reset')}
                          </Button>
                        ) : (
                          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setConfirmReset(true)}>
                            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('cc_lists.reset', 'Reset to standard')}
                          </Button>
                        )
                      ) : null}
                      <Button type="button" variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setDrafts(toDrafts(selected.options))}>
                        {t('cc_lists.undo', 'Undo changes')}
                      </Button>
                      <Button type="button" size="sm" disabled={!dirty || saving} onClick={save}>
                        <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {saving ? t('cc_lists.saving', 'Saving…') : t('cc_lists.save', 'Save list')}
                      </Button>
                    </div>
                  ) : null}
                </div>

                {selected.fixed ? (
                  <div className="flex items-start gap-2 rounded-md border border-status-info-border bg-status-info-bg p-3 text-sm text-status-info-text">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p>
                      {t('cc_lists.fixed', 'This list is fixed. {reason}', { reason: selected.fixed })}
                    </p>
                  </div>
                ) : null}

                <ol className="divide-y rounded-md border">
                  {(selected.fixed ? toDrafts(selected.options) : drafts).map((draft, index, all) => (
                    <li key={draft.id} className={cn('flex items-center gap-2 px-3 py-2', !draft.active && 'bg-muted/40')}>
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                      {selected.fixed || draft.locked ? (
                        <span className={cn('flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-sm', !draft.active && 'text-muted-foreground line-through')}>
                          <span className="truncate">{draft.value}</span>
                          {draft.locked && !selected.fixed ? (
                            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3 w-3" aria-hidden="true" />
                              {t('cc_lists.locked', 'the system uses this one')}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <Input
                          value={draft.value}
                          aria-label={t('cc_lists.choice', 'Choice {number}', { number: index + 1 })}
                          className={cn('min-w-0 flex-1', !draft.active && 'text-muted-foreground')}
                          onChange={(event) => setDrafts((prev) => prev.map((entry) => (entry.id === draft.id ? { ...entry, value: event.target.value } : entry)))}
                        />
                      )}
                      {!selected.fixed ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button type="button" variant="ghost" size="icon" disabled={index === 0} aria-label={t('cc_lists.up', 'Move up')} onClick={() => move(index, -1)}>
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" disabled={index === all.length - 1} aria-label={t('cc_lists.down', 'Move down')} onClick={() => move(index, 1)}>
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Switch
                            checked={draft.active}
                            disabled={draft.locked}
                            aria-label={draft.active ? t('cc_lists.hide', 'Switch off {value}', { value: draft.value }) : t('cc_lists.show', 'Switch on {value}', { value: draft.value })}
                            onCheckedChange={(checked) => setDrafts((prev) => prev.map((entry) => (entry.id === draft.id ? { ...entry, active: checked } : entry)))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={draft.locked}
                            aria-label={t('cc_lists.remove', 'Delete {value}', { value: draft.value })}
                            onClick={() => setDrafts((prev) => prev.filter((entry) => entry.id !== draft.id))}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>

                {!selected.fixed ? (
                  <>
                    <form
                      className="flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        addValue()
                      }}
                    >
                      <Input value={newValue} onChange={(event) => setNewValue(event.target.value)} placeholder={t('cc_lists.newPlaceholder', 'New choice, e.g. {example}', { example: selected.options[0]?.value ?? '' })} aria-label={t('cc_lists.new', 'New choice')} maxLength={80} />
                      <Button type="submit" variant="outline" disabled={!newValue.trim()}>
                        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t('cc_lists.add', 'Add')}
                      </Button>
                    </form>
                    <p className="text-xs text-muted-foreground">
                      {t('cc_lists.help', 'Switched-off choices disappear from new forms but stay on records that already use them. Deleting works the same way.')}
                      {renamed.length ? ` ${t('cc_lists.renameHelp', 'Renamed choices apply to new entries; saved records keep the old wording.')}` : ''}
                    </p>
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default DropdownManager
