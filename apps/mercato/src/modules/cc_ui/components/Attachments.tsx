"use client"

import * as React from 'react'
import { ChevronDown, FileText, History, ImageIcon, Paperclip, RefreshCw, Upload } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { useGranted } from '../../cc_departments/components/useGranted'
import { announceActivity } from './Timeline'

type FileItem = { id: string; fileName: string; mimeType: string; fileSize: number; at: string; by: string | null; label: string | null; version: number }
type FileGroup = FileItem & { older: FileItem[] }
type FilesPage = { entityId: string; recordId: string; items: FileGroup[] }

const ACCEPT = 'image/*,application/pdf'

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function FileLine({ file, old }: { file: FileItem; old?: boolean }) {
  const t = useT()
  const image = file.mimeType.startsWith('image/')
  return (
    <div className={cn('flex min-w-0 items-center gap-3', old && 'opacity-80')}>
      <a href={`/api/attachments/file/${file.id}`} target="_blank" rel="noopener" className="shrink-0">
        {image ? (
          <img src={`/api/attachments/file/${file.id}`} alt={file.fileName} className="h-12 w-12 rounded-md border object-cover" loading="lazy" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted">
            {file.mimeType === 'application/pdf' ? <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
          </span>
        )}
      </a>
      <div className="min-w-0 flex-1">
        <a href={`/api/attachments/file/${file.id}`} target="_blank" rel="noopener" className="block truncate text-sm font-medium hover:underline">
          {file.label ?? file.fileName}
        </a>
        <p className="truncate text-xs text-muted-foreground">
          {file.label ? `${file.fileName} · ` : ''}
          {size(file.fileSize)} · {when(file.at)}
          {file.by ? ` · ${file.by}` : ''}
        </p>
      </div>
      {file.version > 1 || old ? <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{t('cc_ui.files.version', 'v{n}', { n: file.version })}</span> : null}
    </div>
  )
}

export function Attachments({ type, id, title, hint, onChanged }: { type: string; id: string; title?: string; hint?: string; onChanged?: () => void }) {
  const t = useT()
  const granted = useGranted()
  const canUpload = granted.has('attachments.manage')
  const [page, setPage] = React.useState<FilesPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [label, setLabel] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Record<string, boolean>>({})
  const addInput = React.useRef<HTMLInputElement>(null)
  const replaceInput = React.useRef<HTMLInputElement>(null)
  const replacing = React.useRef<string | null>(null)

  const load = React.useCallback(async () => {
    const call = await apiCall<FilesPage & { error?: string }>(`/api/cc_audit/files?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) {
      setError(call.status === 403 ? t('cc_ui.files.forbidden', 'You cannot see the files of this record.') : t('cc_ui.files.error', 'Could not load the files.'))
      return
    }
    setError(null)
    setPage(call.result)
  }, [type, id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const upload = async (files: FileList | null, replaces: string | null) => {
    if (!files?.length || !page) return
    setBusy(replaces ?? 'new')
    const failed: string[] = []
    for (const file of Array.from(replaces ? [files[0]] : files)) {
      const form = new FormData()
      form.set('entityId', page.entityId)
      form.set('recordId', page.recordId)
      form.set('file', file)
      const sent = await apiCall<{ ok?: boolean; item?: { id: string }; error?: string }>('/api/attachments', { method: 'POST', body: form }, { fallback: null })
      const attachmentId = sent.result?.item?.id
      if (!sent.ok || !attachmentId) {
        failed.push(file.name)
        continue
      }
      const noted = await apiCall<{ ok?: boolean; error?: string }>('/api/cc_audit/files', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, id, attachmentId, label: replaces ? null : label.trim() || null, replaces }),
      })
      if (!noted.ok) failed.push(file.name)
    }
    setBusy(null)
    setLabel('')
    if (failed.length) flash(t('cc_ui.files.failed', 'Could not upload: {names}', { names: failed.join(', ') }), 'error')
    else flash(replaces ? t('cc_ui.files.replaced', 'File replaced. The old one is kept under earlier versions.') : t('cc_ui.files.added', 'File attached'), 'success')
    await load()
    announceActivity(type, id)
    onChanged?.()
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {title ?? t('cc_ui.files.title', 'Photos and documents')}
            {page?.items.length ? <span className="text-xs font-normal text-muted-foreground">({page.items.length})</span> : null}
          </h2>
          <p className="text-xs text-muted-foreground">{hint ?? t('cc_ui.files.hint', 'Photos, PDFs and scans for this record. Replacing a file keeps the old one.')}</p>
        </div>
      </div>

      {error ? <p className="text-sm text-status-error-text">{error}</p> : null}
      {!page && !error ? (
        <div className="flex justify-center py-3">
          <Spinner />
        </div>
      ) : null}

      {page ? (
        page.items.length ? (
          <ul className="divide-y">
            {page.items.map((file) => (
              <li key={file.id} className="space-y-2 py-2">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <FileLine file={file} />
                  </div>
                  {canUpload ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        replacing.current = file.id
                        replaceInput.current?.click()
                      }}
                    >
                      {busy === file.id ? <Spinner className="h-3.5 w-3.5" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                      <span className="hidden sm:inline">{t('cc_ui.files.replace', 'Replace')}</span>
                    </Button>
                  ) : null}
                </div>
                {file.older.length ? (
                  <div className="pl-15">
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen((prev) => ({ ...prev, [file.id]: !prev[file.id] }))} aria-expanded={Boolean(open[file.id])}>
                      <History className="h-3 w-3" aria-hidden="true" />
                      {t('cc_ui.files.older', 'Earlier versions ({count})', { count: file.older.length })}
                      <ChevronDown className={cn('h-3 w-3 transition-transform', open[file.id] && 'rotate-180')} aria-hidden="true" />
                    </button>
                    {open[file.id] ? (
                      <div className="mt-2 space-y-2">
                        {file.older.map((older) => (
                          <FileLine key={older.id} file={older} old />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">{t('cc_ui.files.empty', 'No files yet.')}</p>
        )
      ) : null}

      {canUpload && page ? (
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t('cc_ui.files.labelHint', 'What is it? e.g. Weighbridge slip (optional)')} maxLength={120} className="sm:flex-1" />
          <Button type="button" variant="outline" disabled={Boolean(busy)} onClick={() => addInput.current?.click()}>
            {busy === 'new' ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
            {t('cc_ui.files.add', 'Add photo / PDF')}
          </Button>
        </div>
      ) : null}
      <input
        ref={addInput}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          void upload(event.target.files, null)
          event.target.value = ''
        }}
      />
      <input
        ref={replaceInput}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          void upload(event.target.files, replacing.current)
          event.target.value = ''
        }}
      />
    </section>
  )
}

export default Attachments
