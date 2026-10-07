"use client"

import * as React from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { PerspectiveSidebar, type ColumnChooserField } from '@open-mercato/ui/backend/PerspectiveSidebar'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { PerspectiveDto, PerspectiveSettings, PerspectivesIndexResponse, RolePerspectiveDto } from '@open-mercato/shared/modules/perspectives/types'

export type ViewColumn = { key: string; label: string; group: string; alwaysVisible?: boolean }
export type BuiltInView = { id: string; name: string; columns: string[] }

const PRESET_PREFIX = 'builtin:'
const EMPTY: PerspectivesIndexResponse = { tableId: '', perspectives: [], defaultPerspectiveId: null, rolePerspectives: [], manageableRolePerspectives: [], roles: [], canApplyToRoles: false }

function presetDto(tableId: string, view: BuiltInView, allKeys: string[]): RolePerspectiveDto {
  const visibility = Object.fromEntries(allKeys.map((key) => [key, view.columns.includes(key)]))
  return {
    id: `${PRESET_PREFIX}${view.id}`,
    name: view.name,
    tableId,
    settings: { columnOrder: [...view.columns, ...allKeys.filter((key) => !view.columns.includes(key))], columnVisibility: visibility },
    isDefault: false,
    createdAt: new Date(0).toISOString(),
    roleId: 'builtin',
    tenantId: null,
    organizationId: null,
    roleName: 'Built-in',
  }
}

function visibleFrom(settings: PerspectiveSettings, allKeys: string[]): string[] {
  const order = (settings.columnOrder ?? allKeys).filter((key) => allKeys.includes(key))
  const rest = allKeys.filter((key) => !order.includes(key))
  const visibility = settings.columnVisibility ?? {}
  return [...order, ...rest].filter((key) => visibility[key] !== false && (settings.columnVisibility ? visibility[key] === true : true))
}

type Props = {
  tableId: string
  columns: ViewColumn[]
  visible: string[]
  onChange: (next: string[]) => void
  builtIn?: BuiltInView[]
  label?: string
}

export function ViewsButton({ tableId, columns, visible, onChange, builtIn = [], label }: Props) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [data, setData] = React.useState<PerspectivesIndexResponse>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [deletingIds, setDeletingIds] = React.useState<string[]>([])
  const [clearingIds, setClearingIds] = React.useState<string[]>([])
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)
  const allKeys = React.useMemo(() => columns.map((column) => column.key), [columns])

  const load = React.useCallback(async () => {
    setLoading(true)
    const call = await apiCall<PerspectivesIndexResponse>(`/api/perspectives/${encodeURIComponent(tableId)}`, undefined, { fallback: EMPTY })
    setUnavailable(!call.ok)
    setData(call.ok && call.result ? call.result : EMPTY)
    setLoading(false)
  }, [tableId])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const order = React.useMemo(() => [...visible, ...allKeys.filter((key) => !visible.includes(key))], [visible, allKeys])
  const settings = React.useCallback((): PerspectiveSettings => ({ columnOrder: order, columnVisibility: Object.fromEntries(allKeys.map((key) => [key, visible.includes(key)])) }), [order, allKeys, visible])

  const presets = React.useMemo(() => builtIn.map((view) => presetDto(tableId, view, allKeys)), [builtIn, tableId, allKeys])

  const activate = (perspective: PerspectiveDto | RolePerspectiveDto) => {
    const next = visibleFrom(perspective.settings, allKeys)
    if (next.length) onChange(next)
    setActiveId(perspective.id)
  }

  const save = async (input: { name: string; isDefault: boolean; applyToRoles: string[]; setRoleDefault: boolean; perspectiveId?: string | null; settings?: PerspectiveSettings }) => {
    setSaving(true)
    try {
      const existing = input.perspectiveId ? data.perspectives.find((entry) => entry.id === input.perspectiveId) : null
      const body = { name: input.name, settings: input.settings ?? settings(), isDefault: input.isDefault, applyToRoles: input.applyToRoles, setRoleDefault: input.setRoleDefault, ...(input.perspectiveId ? { perspectiveId: input.perspectiveId } : {}) }
      const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(existing?.updatedAt ?? null), () =>
        apiCall<{ perspective?: PerspectiveDto; error?: string }>(`/api/perspectives/${encodeURIComponent(tableId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      )
      if (!call.ok) throw new Error(call.result?.error ?? t('cc_products.views.saveError', 'Could not save the view.'))
      if (call.result?.perspective) setActiveId(call.result.perspective.id)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    setDeletingIds((prev) => [...prev, id])
    try {
      await apiCall(`/api/perspectives/${encodeURIComponent(tableId)}/${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (activeId === id) setActiveId(null)
      await load()
    } finally {
      setDeletingIds((prev) => prev.filter((entry) => entry !== id))
    }
  }

  const clearRole = async (perspective: RolePerspectiveDto) => {
    if (perspective.id.startsWith(PRESET_PREFIX)) {
      flash(t('cc_products.views.builtIn', 'Built-in views cannot be deleted. Save your own view instead.'), 'error')
      return
    }
    setClearingIds((prev) => [...prev, perspective.roleId])
    try {
      await apiCall(`/api/perspectives/${encodeURIComponent(tableId)}/roles/${encodeURIComponent(perspective.roleId)}`, { method: 'DELETE' })
      await load()
    } finally {
      setClearingIds((prev) => prev.filter((entry) => entry !== perspective.roleId))
    }
  }

  const available: ColumnChooserField[] = columns.map((column) => ({ key: column.key, label: column.label, group: column.group, alwaysVisible: column.alwaysVisible }))
  const activeName = [...presets, ...data.perspectives, ...data.rolePerspectives].find((entry) => entry.id === activeId)?.name

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {activeName ?? label ?? t('cc_products.views.button', 'Views')}
        <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary tabular-nums">{visible.length}</span>
      </Button>
      <PerspectiveSidebar
        open={open}
        onOpenChange={setOpen}
        loading={loading}
        perspectives={data.perspectives}
        rolePerspectives={[...presets, ...data.rolePerspectives]}
        roles={data.roles}
        activePerspectiveId={activeId}
        onActivatePerspective={(perspective) => activate(perspective)}
        onDeletePerspective={remove}
        onClearRole={clearRole}
        onSave={save}
        canApplyToRoles={data.canApplyToRoles}
        availableColumns={available}
        visibleColumnKeys={visible}
        columnOrder={order}
        onToggleColumn={(key) => {
          setActiveId(null)
          onChange(visible.includes(key) ? visible.filter((entry) => entry !== key) : [...visible, key])
        }}
        onReorderColumns={(ids) => {
          setActiveId(null)
          onChange(ids.filter((key) => visible.includes(key)))
        }}
        saving={saving}
        deletingIds={deletingIds}
        roleClearingIds={clearingIds}
        apiWarning={unavailable ? t('cc_products.views.unavailable', 'Saved views are not available right now. Column changes still apply.') : null}
      />
    </>
  )
}

export default ViewsButton
