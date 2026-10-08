"use client"

import * as React from 'react'
import Link from 'next/link'
import { Inbox, Plus, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PlantTable } from '../../cc_production/components/PlantTable'
import { useGranted } from '../../cc_departments/components/useGranted'
import { formatDate, formatDateTime } from '../../cc_orders/components/format'
import { STAGE_LABEL, STAGE_VARIANT, type Enquiry } from './types'

type ListResult = { items: Enquiry[]; counts: Record<string, number>; overdue: number }

const TABS = ['open', 'overdue', 'new', 'quoted', 'negotiating', 'won', 'lost', 'all'] as const

export function EnquiriesPage() {
  const t = useT()
  const granted = useGranted()
  const [tab, setTab] = React.useState<(typeof TABS)[number]>('open')
  const [search, setSearch] = React.useState('')
  const [data, setData] = React.useState<ListResult | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ stage: tab })
      if (search.trim()) params.set('search', search.trim())
      apiCall<ListResult>(`/api/cc_crm/enquiries?${params.toString()}`).then((call) => {
        if (!cancelled && call.result) setData(call.result)
      })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [tab, search])

  const counts = data?.counts ?? {}
  const tabCount = (key: string) => (key === 'open' ? (counts.new ?? 0) + (counts.quoted ?? 0) + (counts.negotiating ?? 0) : key === 'overdue' ? (data?.overdue ?? 0) : key === 'all' ? Object.values(counts).reduce((sum, value) => sum + value, 0) : (counts[key] ?? 0))
  const tabLabel: Record<string, string> = { open: t('cc_crm.tab.open', 'Open'), overdue: t('cc_crm.tab.overdue', 'Follow-up overdue'), all: t('cc_crm.tab.all', 'All') }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t('cc_crm.enquiries.title', 'Enquiries')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_crm.enquiries.subtitle', 'Every enquiry from IndiaMART, WhatsApp, email, phone, walk-in or referral, with its next follow-up. Overdue follow-ups go to the owner overview.')}</p>
            </div>
            {granted.has('cc_crm.manage') ? (
              <Button asChild>
                <Link href="/backend/crm/enquiries/new">
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.enquiries.new', 'Log enquiry')}
                </Link>
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn('rounded-full border px-3 py-1 text-xs', tab === key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground', key === 'overdue' && tabCount(key) > 0 && tab !== key && 'border-status-error-border text-status-error-text')}
              >
                {tabLabel[key] ?? t(`cc_crm.stage.${key}`, STAGE_LABEL[key as keyof typeof STAGE_LABEL])} <span className="tabular-nums">{tabCount(key)}</span>
              </button>
            ))}
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_crm.enquiries.search', 'Number, company, person, phone, subject')} />
            </div>
          </div>
          {!data ? (
            <LoadingMessage label={t('cc_crm.loading', 'Loading…')} />
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <PlantTable
                tableId="cc_crm.enquiries"
                rows={data.items}
                rowKey={(row) => row.id}
                rowHref={(row) => `/backend/crm/enquiries/${row.id}`}
                empty={<EmptyState className="py-12" variant="subtle" icon={<Inbox className="h-5 w-5" aria-hidden="true" />} title={t('cc_crm.enquiries.empty', 'No enquiries here')} />}
                columns={[
                  { key: 'no', label: t('cc_crm.enquiries.no', 'Enquiry'), alwaysVisible: true, render: (row) => <span className="font-mono text-xs">{row.enquiryNo}</span> },
                  { key: 'received', label: t('cc_crm.enquiries.received', 'Received'), render: (row) => formatDateTime(row.receivedAt) },
                  { key: 'source', label: t('cc_crm.enquiries.source', 'Source'), render: (row) => row.source },
                  { key: 'party', label: t('cc_crm.enquiries.party', 'Company / person'), render: (row) => <span className="font-medium">{row.partyName ?? '—'}{row.customerId ? null : <span className="ml-1 text-xs text-muted-foreground">({t('cc_crm.enquiries.prospect', 'new party')})</span>}</span> },
                  { key: 'contact', label: t('cc_crm.enquiries.contact', 'Contact'), hidden: true, render: (row) => [row.contactName, row.phone, row.email].filter(Boolean).join(' · ') },
                  { key: 'subject', label: t('cc_crm.enquiries.subject', 'Asked for'), render: (row) => <span className="line-clamp-2 max-w-md">{row.subject}</span> },
                  { key: 'owner', label: t('cc_crm.enquiries.owner', 'Owner'), render: (row) => row.ownerName ?? '—' },
                  { key: 'stage', label: t('cc_crm.enquiries.stage', 'Stage'), render: (row) => <StatusBadge variant={STAGE_VARIANT[row.stage]}>{t(`cc_crm.stage.${row.stage}`, STAGE_LABEL[row.stage])}</StatusBadge> },
                  { key: 'next', label: t('cc_crm.enquiries.next', 'Next follow-up'), render: (row) => (row.nextActionOn ? <span className={cn(row.overdue && 'font-semibold text-status-error-text')}>{formatDate(row.nextActionOn)}{row.nextActionNote ? <span className="block text-xs font-normal text-muted-foreground">{row.nextActionNote}</span> : null}</span> : '—') },
                  { key: 'lost', label: t('cc_crm.enquiries.lostReason', 'Lost reason'), hidden: true, render: (row) => row.lostReason ?? '' },
                ]}
              />
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default EnquiriesPage
