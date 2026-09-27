"use client"

import * as React from 'react'
import { ChevronDown, ChevronRight, FilePlus2, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { AttachmentsSection } from '@open-mercato/ui/backend/detail/AttachmentsSection'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { ListSelectItems } from '../../dermat_lists/components/ListSelectItems'

type Doc = {
  id: string
  docNo: string
  version: number
  title: string
  docType: string
  department: string | null
  effectiveDate: string
  reviewDate: string | null
  reviewDue: boolean
  reviewInDays: number | null
  status: 'active' | 'superseded' | 'withdrawn'
  notes: string | null
  changeNote: string | null
  preparedByName: string | null
  updatedAt: string
  versions: Array<{ id: string; version: number; effectiveDate: string; status: string; changeNote: string | null; preparedByName: string | null }>
}
type View = 'active' | 'review_due' | 'history' | 'all'

const ENTITY = 'dermat_quality:qa_document'

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function QaDocumentsPage() {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-qa-documents' })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [view, setView] = React.useState<View>('active')
  const [search, setSearch] = React.useState('')
  const [docs, setDocs] = React.useState<Doc[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [form, setForm] = React.useState({ docNo: '', title: '', docType: 'SOP', department: '', effectiveDate: today, reviewDate: '', notes: '' })
  const [acting, setActing] = React.useState<{ doc: Doc; action: 'revise' | 'withdraw' } | null>(null)
  const [actForm, setActForm] = React.useState({ effectiveDate: today, reviewDate: '', changeNote: '' })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const query = new URLSearchParams({ view })
    if (search.trim()) query.set('search', search.trim())
    const call = await apiCall<{ items?: Doc[]; error?: string }>(`/api/dermat_quality/documents?${query.toString()}`)
    if (!call.ok) {
      setError(call.result?.error ?? t('dermat_quality.docs.loadError', 'Could not load documents.'))
      return
    }
    setError(null)
    setDocs(call.result?.items ?? [])
  }, [view, search, t])

  React.useEffect(() => {
    const handle = window.setTimeout(() => void load(), search ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [load, search])

  const send = async (url: string, body: Record<string, unknown>, version: string | null, success: string) => {
    setBusy(true)
    try {
      const request = () => apiCall<{ error?: string; docNo?: string; version?: number }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'dermat_quality.document', resourceId: String(body.id ?? 'new') }, mutationPayload: body, operation: () => (version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(version), request) : request()) })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_quality.docs.saveError', 'Could not save.'), 'error')
        return false
      }
      flash(success.replace('{doc}', `${call.result?.docNo ?? ''} v${call.result?.version ?? ''}`), 'success')
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (!form.docNo.trim() || !form.title.trim()) return flash(t('dermat_quality.docs.needed', 'Enter the document number and title'), 'error')
    const ok = await send('/api/dermat_quality/documents', { ...form, department: form.department || null, reviewDate: form.reviewDate || null, notes: form.notes || null }, null, t('dermat_quality.docs.created', '{doc} issued. Attach the file below.'))
    if (ok) setCreating(false)
  }

  const act = async () => {
    if (!acting) return
    const ok = await send('/api/dermat_quality/documents/action', { id: acting.doc.id, action: acting.action, effectiveDate: actForm.effectiveDate || null, reviewDate: actForm.reviewDate || null, changeNote: actForm.changeNote }, acting.doc.updatedAt, acting.action === 'revise' ? t('dermat_quality.docs.revised', '{doc} issued. Attach the new file.') : t('dermat_quality.docs.withdrawn', 'Document withdrawn'))
    if (ok) setActing(null)
  }

  const canEdit = granted.has('dermat_quality.documents')

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_quality.docs.title', 'QA documents')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_quality.docs.lede', 'Controlled documents: SOPs, QR and IPQC formats, specifications. Each has a number, a version, an effective date and a review date; old versions stay as superseded.')}</p>
            </div>
            {canEdit ? (
              <Button
                type="button"
                onClick={() => {
                  setForm({ docNo: '', title: '', docType: 'SOP', department: '', effectiveDate: today, reviewDate: '', notes: '' })
                  setCreating(true)
                }}
              >
                <FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_quality.docs.new', 'Issue document')}
              </Button>
            ) : null}
          </header>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('dermat_quality.docs.show', 'Show')}>
              <SegmentedControlItem value="active">{t('dermat_quality.docs.active', 'Current')}</SegmentedControlItem>
              <SegmentedControlItem value="review_due">{t('dermat_quality.docs.reviewDue', 'Review due (30 days)')}</SegmentedControlItem>
              <SegmentedControlItem value="history">{t('dermat_quality.docs.history', 'Old versions')}</SegmentedControlItem>
              <SegmentedControlItem value="all">{t('dermat_quality.docs.all', 'All')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_quality.docs.search', 'Number, title, type, department')} className="pl-9" aria-label={t('dermat_quality.docs.search', 'Number, title, type, department')} />
            </div>
          </div>
          {error ? <ErrorMessage label={error} /> : null}
          {!docs && !error ? <LoadingMessage label={t('dermat_quality.docs.loading', 'Loading…')} /> : null}
          {docs && !docs.length ? <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">{t('dermat_quality.docs.empty', 'No documents here.')}</p> : null}
          {docs?.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" className="flex min-w-0 items-start gap-2 text-left" aria-expanded={open === doc.id} onClick={() => setOpen(open === doc.id ? null : doc.id)}>
                      {open === doc.id ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold">{doc.docNo}</span>
                          <span className="rounded-sm bg-muted px-1.5 text-xs">v{doc.version}</span>
                          <span className="text-xs text-muted-foreground">{doc.docType}</span>
                          {doc.status !== 'active' ? <StatusBadge variant="neutral">{doc.status === 'superseded' ? t('dermat_quality.docs.superseded', 'Superseded') : t('dermat_quality.docs.withdrawnBadge', 'Withdrawn')}</StatusBadge> : null}
                          {doc.reviewDue ? <StatusBadge variant="error">{t('dermat_quality.docs.reviewOver', 'Review overdue')}</StatusBadge> : doc.status === 'active' && doc.reviewInDays !== null && doc.reviewInDays <= 30 ? <StatusBadge variant="warning">{t('dermat_quality.docs.reviewSoon', 'Review in {days} d', { days: doc.reviewInDays })}</StatusBadge> : null}
                        </span>
                        <span className="block font-medium">{doc.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[doc.department, t('dermat_quality.docs.effective', 'effective {date}', { date: day(doc.effectiveDate) }), doc.reviewDate ? t('dermat_quality.docs.review', 'review {date}', { date: day(doc.reviewDate) }) : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </button>
                    {canEdit && doc.status === 'active' ? (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setActForm({ effectiveDate: today, reviewDate: '', changeNote: '' })
                            setActing({ doc, action: 'revise' })
                          }}
                        >
                          {t('dermat_quality.docs.revise', 'New version')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActForm({ effectiveDate: today, reviewDate: '', changeNote: '' })
                            setActing({ doc, action: 'withdraw' })
                          }}
                        >
                          {t('dermat_quality.docs.withdraw', 'Withdraw')}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                  {open === doc.id ? (
                    <div className="grid grid-cols-1 gap-4 border-t bg-muted/10 px-4 py-3 lg:grid-cols-2">
                      <div className="space-y-2">
                        <AttachmentsSection entityId={ENTITY} recordId={doc.id} title={t('dermat_quality.docs.file', 'File for version {version}', { version: doc.version })} compact />
                        {doc.changeNote ? <p className="text-xs text-muted-foreground">{t('dermat_quality.docs.changed', 'What changed: {note}', { note: doc.changeNote })}</p> : null}
                        {doc.notes ? <p className="text-xs text-muted-foreground">{doc.notes}</p> : null}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('dermat_quality.docs.versions', 'Other versions')}</p>
                        {doc.versions.length ? (
                          <ul className="space-y-1 text-sm">
                            {doc.versions.map((entry) => (
                              <li key={entry.id} className={cn('rounded-md border bg-card px-3 py-1.5', entry.status === 'active' && 'border-status-success-border')}>
                                <span className="font-medium">v{entry.version}</span> · {day(entry.effectiveDate)} · {entry.status}
                                {entry.changeNote ? <span className="block text-xs text-muted-foreground">{entry.changeNote}</span> : null}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground">{t('dermat_quality.docs.firstVersion', 'This is the only version.')}</p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void create()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('dermat_quality.docs.newTitle', 'Issue a document')}</DialogTitle>
              <DialogDescription>{t('dermat_quality.docs.newHint', 'Starts at version 1. Attach the signed file after saving.')}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="doc-no">{t('dermat_quality.docs.no', 'Document no. *')}</Label>
                <Input id="doc-no" value={form.docNo} placeholder="SOP/QA/001" onChange={(event) => setForm({ ...form, docNo: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('dermat_quality.docs.type', 'Type *')}</Label>
                <Select value={form.docType} onValueChange={(value) => setForm({ ...form, docType: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <ListSelectItems listKey="qa_document_types" current={form.docType} />
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="doc-title">{t('dermat_quality.docs.titleLabel', 'Title *')}</Label>
                <Input id="doc-title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-dept">{t('dermat_quality.docs.department', 'Department')}</Label>
                <Input id="doc-dept" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-effective">{t('dermat_quality.docs.effectiveLabel', 'Effective from *')}</Label>
                <Input id="doc-effective" type="date" value={form.effectiveDate} onChange={(event) => setForm({ ...form, effectiveDate: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="doc-review">{t('dermat_quality.docs.reviewLabel', 'Next review')}</Label>
                <Input id="doc-review" type="date" value={form.reviewDate} onChange={(event) => setForm({ ...form, reviewDate: event.target.value })} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="doc-notes">{t('dermat_quality.docs.notes', 'Notes')}</Label>
                <Textarea id="doc-notes" rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreating(false)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={() => void create()} disabled={busy}>
                {t('dermat_quality.docs.issue', 'Issue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(acting)} onOpenChange={(value) => (value ? undefined : setActing(null))}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void act()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{acting?.action === 'revise' ? t('dermat_quality.docs.reviseTitle', 'New version of {no}', { no: acting.doc.docNo }) : t('dermat_quality.docs.withdrawTitle', 'Withdraw {no}?', { no: acting?.doc.docNo ?? '' })}</DialogTitle>
              <DialogDescription>{acting?.action === 'revise' ? t('dermat_quality.docs.reviseHint', 'Version {v} becomes current; version {old} is kept as superseded.', { v: (acting?.doc.version ?? 0) + 1, old: acting?.doc.version ?? 0 }) : t('dermat_quality.docs.withdrawHint', 'It stays in the register as withdrawn.')}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {acting?.action === 'revise' ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="rev-effective">{t('dermat_quality.docs.effectiveLabel', 'Effective from *')}</Label>
                    <Input id="rev-effective" type="date" value={actForm.effectiveDate} onChange={(event) => setActForm({ ...actForm, effectiveDate: event.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rev-review">{t('dermat_quality.docs.reviewLabel', 'Next review')}</Label>
                    <Input id="rev-review" type="date" value={actForm.reviewDate} onChange={(event) => setActForm({ ...actForm, reviewDate: event.target.value })} />
                  </div>
                </>
              ) : null}
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="rev-note">{acting?.action === 'revise' ? t('dermat_quality.docs.changeNote', 'What changed *') : t('dermat_quality.docs.why', 'Why *')}</Label>
                <Textarea id="rev-note" rows={3} value={actForm.changeNote} onChange={(event) => setActForm({ ...actForm, changeNote: event.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActing(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant={acting?.action === 'withdraw' ? 'destructive' : 'default'} onClick={() => void act()} disabled={busy}>
                {acting?.action === 'revise' ? t('dermat_quality.docs.issueVersion', 'Issue version') : t('dermat_quality.docs.withdrawConfirm', 'Withdraw')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default QaDocumentsPage
