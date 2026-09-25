"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, CircleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { formatQty } from './MaterialPicker'

type TreeNode = {
  productId: string
  name: string
  code: string | null
  kind: string | null
  unit: string | null
  perParent: number | null
  quantity: number
  onHand: number
  bom: { id: string; code: string; version: number; status: string } | null
  children: TreeNode[]
  cycle?: boolean
  fill: { qty: number; unit: string; specificGravity: number | null } | null
}

type Requirement = {
  productId: string
  name: string
  code: string | null
  kind: string | null
  unit: string | null
  quantity: number
  onHand: number
  shortage: number
}

type TreeResponse = { quantity: number; unit: string; tree: TreeNode; requirements: Requirement[] }

const KIND_LABEL: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG', rnd: 'R&D' }

function KindChip({ kind }: { kind: string | null }) {
  return <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-xs font-semibold">{KIND_LABEL[kind ?? ''] ?? kind ?? '—'}</span>
}

function perParentLabel(parentKind: string | null, value: number | null, unit: string | null, fill: TreeNode['fill']): string {
  if (value == null) return ''
  if (fill) {
    const sg = fill.unit === 'ml' || fill.unit === 'l' ? ` · SG ${formatQty(fill.specificGravity && fill.specificGravity > 0 ? fill.specificGravity : 1, 3)}` : ''
    return `${formatQty(fill.qty, 3)} ${fill.unit} = ${formatQty(value, 5)} ${unit ?? ''} / pc${sg}`
  }
  if (parentKind === 'finished_goods') return `${formatQty(value, 5)} ${unit ?? ''} / pc`
  return `${formatQty(value, 4)} %`
}

function NodeRow({ node, depth, parentKind, collapsed, toggle }: {
  node: TreeNode
  depth: number
  parentKind: string | null
  collapsed: Set<string>
  toggle: (key: string) => void
}) {
  const t = useT()
  const key = `${depth}-${node.productId}`
  const hasChildren = node.children.length > 0
  const isOpen = !collapsed.has(key)
  const short = depth > 0 && !hasChildren && node.quantity > node.onHand
  const needsBom = depth > 0 && node.kind === 'bulk' && !node.bom
  return (
    <>
      <tr className={cn(depth === 0 && 'bg-muted/30 font-semibold')}>
        <td className="py-2 pr-3">
          <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 1.5}rem` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(key)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                aria-label={isOpen ? t('dermat_boms.tree.collapse', 'Collapse') : t('dermat_boms.tree.expand', 'Expand')}
              >
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <span className="inline-block w-5" />
            )}
            <KindChip kind={node.kind} />
            <span className="min-w-0">
              <span className="block truncate">{node.name}</span>
              <span className="block font-mono text-xs font-normal text-muted-foreground">{node.code ?? ''}</span>
            </span>
            {node.bom && depth > 0 ? (
              <Link href={`/backend/boms/${node.bom.id}`} className="ml-1 rounded border px-1.5 py-0.5 font-mono text-xs font-normal text-primary hover:bg-muted">
                {node.bom.code} v{node.bom.version}
                {node.bom.status === 'draft' ? ` · ${t('dermat_boms.status.draft', 'draft')}` : ''}
              </Link>
            ) : null}
            {needsBom ? (
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-status-warning-text">
                <CircleAlert className="h-3.5 w-3.5" />
                {t('dermat_boms.tree.noBom', 'no formula yet')}
              </span>
            ) : null}
            {node.cycle ? (
              <span className="ml-1 text-xs font-normal text-status-error-text">{t('dermat_boms.tree.cycle', 'loop — not expanded')}</span>
            ) : null}
          </div>
        </td>
        <td className="py-2 pr-3 text-right font-mono text-xs text-muted-foreground">{perParentLabel(parentKind, node.perParent, node.unit, node.fill)}</td>
        <td className="py-2 pr-3 text-right font-mono">
          {formatQty(node.quantity)} <span className="text-xs text-muted-foreground">{node.unit ?? ''}</span>
        </td>
        <td className={cn('py-2 text-right font-mono', short && 'text-status-error-text')}>
          {depth > 0 ? (
            <>
              {formatQty(node.onHand)} <span className="text-xs text-muted-foreground">{node.unit ?? ''}</span>
            </>
          ) : null}
        </td>
      </tr>
      {hasChildren && isOpen
        ? node.children.map((child, index) => (
            <NodeRow key={`${child.productId}-${index}`} node={child} depth={depth + 1} parentKind={node.kind} collapsed={collapsed} toggle={toggle} />
          ))
        : null}
    </>
  )
}

export function BomTree({ bomId, defaultQuantity, unit, dirty }: { bomId: string; defaultQuantity: number; unit: string; dirty: boolean }) {
  const t = useT()
  const [quantity, setQuantity] = React.useState(String(defaultQuantity))
  const [data, setData] = React.useState<TreeResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    const value = Number(quantity)
    if (!(value > 0)) return
    let cancelled = false
    setLoading(true)
    const handle = window.setTimeout(async () => {
      const call = await apiCall<TreeResponse>(`/api/dermat_boms/tree?bomId=${encodeURIComponent(bomId)}&quantity=${value}`)
      if (cancelled) return
      setData(call.ok ? call.result : null)
      setLoading(false)
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [bomId, quantity])

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const shortCount = data?.requirements.filter((row) => row.shortage > 0).length ?? 0

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('dermat_boms.tree.make', 'Quantity to make ({unit})', { unit })}</Label>
          <Input type="number" min={0} step="any" className="h-9 w-40 text-right font-mono" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">
          {dirty
            ? t('dermat_boms.tree.dirty', 'Showing the last saved version. Save to include your changes.')
            : t('dermat_boms.tree.hint', 'Each Bulk opens into its own current formula, down to raw materials.')}
        </p>
      </div>

      {loading && !data ? <LoadingMessage label={t('dermat_boms.tree.loading', 'Working out materials…')} /> : null}

      {data ? (
        <>
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('dermat_boms.tree.title', 'BOM tree')}</CardTitle>
              <CardDescription className="text-xs">
                {t('dermat_boms.tree.titleHint', 'What goes into {quantity} {unit}, level by level.', { quantity: formatQty(data.quantity), unit: data.unit })}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-3">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2 text-left">{t('dermat_boms.tree.material', 'Material')}</th>
                    <th className="w-56 pb-2 pr-3 text-right">{t('dermat_boms.tree.per', 'In parent')}</th>
                    <th className="w-36 pb-2 pr-3 text-right">{t('dermat_boms.tree.need', 'Needed')}</th>
                    <th className="w-32 pb-2 text-right">{t('dermat_boms.tree.onHand', 'On hand')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <NodeRow node={data.tree} depth={0} parentKind={null} collapsed={collapsed} toggle={toggle} />
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('dermat_boms.tree.totals', 'Total materials needed')}</CardTitle>
              <CardDescription className="text-xs">
                {shortCount
                  ? t('dermat_boms.tree.shortSummary', '{short} of {total} materials are short.', { short: shortCount, total: data.requirements.length })
                  : t('dermat_boms.tree.okSummary', 'All {total} materials are in stock.', { total: data.requirements.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-28 p-3 text-left">{t('dermat_boms.table.code', 'Code')}</th>
                    <th className="p-3 text-left">{t('dermat_boms.table.material', 'Material')}</th>
                    <th className="w-16 p-3 text-center">{t('dermat_boms.table.type', 'Type')}</th>
                    <th className="w-36 p-3 text-right">{t('dermat_boms.tree.need', 'Needed')}</th>
                    <th className="w-36 p-3 text-right">{t('dermat_boms.tree.onHand', 'On hand')}</th>
                    <th className="w-36 p-3 text-right">{t('dermat_boms.tree.short', 'Short')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.requirements.map((row) => (
                    <tr key={row.productId} className={cn(row.shortage > 0 && 'bg-status-error-bg')}>
                      <td className="p-3 font-mono text-xs">{row.code ?? '—'}</td>
                      <td className="p-3">{row.name}</td>
                      <td className="p-3 text-center">
                        <KindChip kind={row.kind} />
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatQty(row.quantity)} <span className="text-xs text-muted-foreground">{row.unit ?? ''}</span>
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatQty(row.onHand)} <span className="text-xs text-muted-foreground">{row.unit ?? ''}</span>
                      </td>
                      <td className={cn('p-3 text-right font-mono font-semibold', row.shortage > 0 ? 'text-status-error-text' : 'text-muted-foreground')}>
                        {row.shortage > 0 ? `${formatQty(row.shortage)} ${row.unit ?? ''}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}

export default BomTree
