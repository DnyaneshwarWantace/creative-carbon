"use client"

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StageDefinitionSheet } from '../../../components/StageDefinitionSheet'
import { DEPARTMENT_LABELS, stripInternal, type StageDefinitionView } from '../../../components/types'

export default function WorkflowStagesPage() {
  const t = useT()
  const [items, setItems] = React.useState<StageDefinitionView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [scope, setScope] = React.useState<'order' | 'order_line'>('order')
  const [editing, setEditing] = React.useState<StageDefinitionView | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const call = await apiCall<{ items: StageDefinitionView[]; error?: string }>('/api/dermat_workflow/definitions?includeInactive=true')
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.stages.loadError', 'Could not load stages.')))
      } else {
        setError(null)
        setItems(call.result.items)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  const rows = React.useMemo(
    () => items.filter((item) => item.subjectType === scope).sort((a, b) => a.sequence - b.sequence),
    [items, scope],
  )

  const columns = React.useMemo<ColumnDef<StageDefinitionView>[]>(
    () => [
      {
        id: 'sequence',
        header: '#',
        cell: ({ row }) => rows.findIndex((item) => item.id === row.original.id) + 1,
      },
      {
        id: 'name',
        header: t('dermat_workflow.stages.name', 'Stage name'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.name}</div>
            {row.original.phaseLabel ? <div className="text-xs text-muted-foreground">{row.original.phaseLabel}</div> : null}
          </div>
        ),
      },
      {
        id: 'department',
        header: t('dermat_workflow.stages.department', 'Department'),
        cell: ({ row }) => DEPARTMENT_LABELS[row.original.department] ?? row.original.department,
      },
      {
        id: 'fields',
        header: t('dermat_workflow.stages.fields', 'Form fields'),
        cell: ({ row }) =>
          row.original.kind === 'qc_test'
            ? t('dermat_workflow.stages.qcCount', '{count} QC parameters', { count: row.original.config?.qcParameters?.length ?? 0 })
            : row.original.isAutomatic
              ? t('dermat_workflow.stages.auto', 'Automatic')
              : t('dermat_workflow.stages.fieldCount', '{count} fields ({required} required)', {
                  count: row.original.fields.length,
                  required: row.original.fields.filter((field) => field.required).length,
                }),
      },
      {
        id: 'status',
        header: t('dermat_workflow.queue.status', 'Status'),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.isActive ? (
              <StatusBadge variant="success">{t('dermat_workflow.stages.inUse', 'In use')}</StatusBadge>
            ) : (
              <StatusBadge variant="neutral">{t('dermat_workflow.stages.off', 'Off')}</StatusBadge>
            )}
            {row.original.isOptional ? <StatusBadge variant="info">{t('dermat_workflow.stages.optionalShort', 'Optional')}</StatusBadge> : null}
          </div>
        ),
      },
    ],
    [rows, t],
  )

  return (
    <Page>
      <PageBody>
        <div className="mb-4 space-y-3">
          <div>
            <h1 className="text-lg font-semibold">{t('dermat_workflow.stages.title', 'Workflow Stages')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('dermat_workflow.stages.subtitle', 'The stages every order goes through, who does each one, and what they must fill in. Click a stage to edit it.')}
            </p>
          </div>
          <SegmentedControl value={scope} onValueChange={(value) => setScope(value === 'order_line' ? 'order_line' : 'order')}>
            <SegmentedControlItem value="order">{t('dermat_workflow.stages.orderStages', 'Order stages')}</SegmentedControlItem>
            <SegmentedControlItem value="order_line">{t('dermat_workflow.stages.productionStages', 'Production stages (per product)')}</SegmentedControlItem>
          </SegmentedControl>
        </div>
        <DataTable<StageDefinitionView>
          columns={columns}
          data={rows}
          isLoading={loading}
          error={error}
          onRowClick={(row) => setEditing(row)}
          emptyState={t('dermat_workflow.stages.empty', 'No stages yet.')}
        />
        <StageDefinitionSheet
          definition={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onSaved={() => setReloadToken((value) => value + 1)}
        />
      </PageBody>
    </Page>
  )
}
