"use client"

import * as React from 'react'
import Link from 'next/link'
import { Activity, ArrowRightLeft, ClipboardList, FileText, Inbox, PhoneCall } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { LinkRows, Panel, RecordColumns, RecordPage, RecordState, formatDay, type Fact } from '../../cc_ui/components/RecordPage'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'
import { QUOTE_LABEL, QUOTE_VARIANT, STAGE_LABEL, STAGE_VARIANT, type EnquiryStage, type QuotationStatus } from './types'

type Person = {
  id: string
  name: string
  email: string
  crmRole: 'manager' | 'sales' | null
  crmOnly: boolean
  erpAccess: boolean
  activeSince: string | null
  lastLoginAt: string | null
  stats: { openEnquiries: number; quotesSent30: number; followUpsDue: number; followUpsMissed: number; won: number; wonValue: number }
  enquiries: Array<{ id: string; enquiryNo: string; subject: string; stage: EnquiryStage; partyName: string | null; nextActionOn: string | null }>
  quotations: Array<{ id: string; quoteNo: string; status: QuotationStatus; partyName: string | null; totalAmount: number; currency: string; orderId: string | null; orderNo: string | null }>
  followUps: Array<{ id: string; kind: string; dueOn: string; note: string | null; overdue: boolean }>
  orders: Array<{ orderId: string; enquiryNo: string; subject: string }>
  feed: Array<{ at: string; kind: string; text: string; href: string }>
}

const ROLE_LABEL: Record<string, string> = { manager: 'CRM manager', sales: 'Sales' }

export function SalesPersonPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canTeam = granted.has('cc_crm.team')
  const [person, setPerson] = React.useState<Person | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [handing, setHanding] = React.useState(false)
  const [team, setTeam] = React.useState<Array<{ id: string; name: string | null; email: string; crmAccess: boolean }>>([])
  const [toName, setToName] = React.useState('')
  const [stamp, setStamp] = React.useState(0)

  const load = React.useCallback(async () => {
    const call = await apiCall<Person & { error?: string }>(`/api/cc_crm/team/member?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(call.result?.error ?? t('cc_crm.person.loadError', 'Could not load this person.'))
    else setPerson(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!handing || team.length) return
    void apiCall<{ items: Array<{ id: string; name: string | null; email: string; crmAccess: boolean }> }>('/api/cc_crm/team', undefined, { fallback: { items: [] } }).then((call) => setTeam(call.result?.items ?? []))
  }, [handing, team.length])

  if (!person) return <RecordState error={error} loadingLabel={t('cc_crm.person.loading', 'Loading…')} />

  const facts: Fact[] = [
    { label: t('cc_crm.person.open', 'Open enquiries'), value: String(person.stats.openEnquiries) },
    { label: t('cc_crm.person.quotes', 'Quotes sent (30 days)'), value: String(person.stats.quotesSent30) },
    { label: t('cc_crm.person.due', 'Follow-ups planned'), value: String(person.stats.followUpsDue) },
    { label: t('cc_crm.person.missed', 'Missed'), value: String(person.stats.followUpsMissed), tone: person.stats.followUpsMissed ? 'bad' : undefined },
    { label: t('cc_crm.person.won', 'Won'), value: String(person.stats.won), tone: person.stats.won ? 'good' : undefined },
    { label: t('cc_crm.person.since', 'Active since'), value: person.activeSince ? formatDay(person.activeSince.slice(0, 10)) : '—' },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/crm/team', label: t('cc_crm.nav.team', 'Team') }}
      overline={t('cc_crm.person.overline', 'Salesperson')}
      title={person.name}
      mono={false}
      badges={
        <>
          {person.crmRole ? <StatusBadge variant="info">{t(`cc_crm.team.role.${person.crmRole}`, ROLE_LABEL[person.crmRole])}</StatusBadge> : <StatusBadge variant="neutral">{t('cc_crm.person.noRole', 'No CRM role')}</StatusBadge>}
          {person.erpAccess ? <StatusBadge variant="neutral">{t('cc_crm.person.erp', 'Also uses the ERP')}</StatusBadge> : null}
        </>
      }
      meta={[person.email, person.lastLoginAt ? t('cc_crm.person.lastLogin', 'last login {at}', { at: new Date(person.lastLoginAt).toLocaleString('en-IN') }) : null].filter(Boolean).join(' · ')}
      actions={
        canTeam ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setHanding(true)}>
            <ArrowRightLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_crm.person.handOver', 'Hand over open work')}
          </Button>
        ) : null
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_crm.person.enquiries', 'Their enquiries')} icon={Inbox} count={person.enquiries.length} flush>
              <LinkRows
                empty={t('cc_crm.person.noEnquiries', 'No enquiries.')}
                rows={person.enquiries.map((row) => ({
                  key: row.id,
                  href: `/backend/crm/enquiries/${row.id}`,
                  primary: <span className="font-mono">{row.enquiryNo}</span>,
                  secondary: [row.partyName, row.subject].filter(Boolean).join(' · '),
                  valueHint: row.nextActionOn ? formatDay(row.nextActionOn) : undefined,
                  value: '',
                  badge: <StatusBadge variant={STAGE_VARIANT[row.stage]}>{t(`cc_crm.stage.${row.stage}`, STAGE_LABEL[row.stage])}</StatusBadge>,
                }))}
              />
            </Panel>
            <Panel title={t('cc_crm.person.quotations', 'Their quotations')} icon={FileText} count={person.quotations.length} flush>
              <LinkRows
                empty={t('cc_crm.person.noQuotes', 'No quotations.')}
                rows={person.quotations.map((row) => ({
                  key: row.id,
                  href: `/backend/crm/quotations/${row.id}`,
                  primary: <span className="font-mono">{row.quoteNo}</span>,
                  secondary: [row.partyName, row.orderNo ? t('cc_crm.person.order', 'order {no}', { no: row.orderNo }) : null].filter(Boolean).join(' · '),
                  value: `${row.currency === 'INR' ? '₹' : `${row.currency} `}${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(row.totalAmount)}`,
                  badge: <StatusBadge variant={QUOTE_VARIANT[row.status]}>{t(`cc_crm.quote.${row.status}`, QUOTE_LABEL[row.status])}</StatusBadge>,
                }))}
              />
            </Panel>
            <Panel title={t('cc_crm.person.feed', 'Work done')} icon={Activity} count={person.feed.length} flush>
              <LinkRows
                empty={t('cc_crm.person.noFeed', 'Nothing yet.')}
                rows={person.feed.map((item, index) => ({
                  key: `${item.at}-${index}`,
                  href: item.href,
                  primary: <span className={cn(item.kind === 'missed' && 'text-status-error-text', item.kind === 'won' && 'text-status-success-text')}>{item.text}</span>,
                  secondary: new Date(item.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                }))}
              />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={t('cc_crm.person.followUps', 'Planned follow-ups')} icon={PhoneCall} count={person.followUps.length} flush>
              <LinkRows
                empty={t('cc_crm.person.noFollowUps', 'Nothing planned.')}
                rows={person.followUps.map((row) => ({ key: row.id, href: `/backend/crm/follow-ups/${row.id}`, primary: <span className={cn(row.overdue && 'text-status-error-text')}>{formatDay(row.dueOn)}</span>, secondary: [row.kind.replace('_', ' '), row.note].filter(Boolean).join(' · ') }))}
              />
            </Panel>
            <Panel title={t('cc_crm.person.orders', 'Orders won')} icon={ClipboardList} count={person.orders.length} flush>
              <LinkRows empty={t('cc_crm.person.noOrders', 'None yet.')} rows={person.orders.map((row) => ({ key: row.orderId, href: `/backend/orders/${row.orderId}`, primary: <span className="font-mono">{row.enquiryNo}</span>, secondary: row.subject }))} />
            </Panel>
          </>
        }
      />
      <Comments type="sales_person" id={person.id} />
      <Timeline type="sales_person" id={person.id} refreshKey={stamp} title={t('cc_crm.person.changes', 'Role changes and hand-overs')} />
      <CorrectDialog
        open={handing}
        onOpenChange={(next) => {
          if (!next) {
            setHanding(false)
            setToName('')
          }
        }}
        destructive={false}
        title={t('cc_crm.person.handTitle', 'Hand over all open work of {name}', { name: person.name })}
        description={
          <span className="mt-2 block">
            <Dropdown value={toName} onChange={(event) => setToName(event.target.value)} aria-label={t('cc_crm.person.to', 'To')}>
              <option value="">{t('cc_crm.person.pickTo', 'Who takes over…')}</option>
              {team
                .filter((member) => member.id !== person.id && member.crmAccess)
                .map((member) => (
                  <option key={member.id} value={member.name ?? member.email}>
                    {member.name ?? member.email}
                  </option>
                ))}
            </Dropdown>
          </span>
        }
        undo={toName ? [t('cc_crm.person.handUndo', '{open} open enquiries, {due} follow-ups and their open orders move to {to}; each one notes the hand-over', { open: person.stats.openEnquiries, due: person.stats.followUpsDue, to: toName })] : []}
        confirmLabel={t('cc_crm.person.handConfirm', 'Hand over')}
        onConfirm={async (reason) => {
          if (!toName) return false
          const call = await apiCall<{ ok?: boolean; moved?: { enquiries: number; followUps: number; orders: number }; error?: string }>('/api/cc_crm/team/member', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: person.id, action: 'hand_over', toName, reason }) })
          if (!call.ok) {
            flash(call.result?.error ?? t('cc_crm.person.handError', 'Could not hand over.'), 'error')
            return false
          }
          const moved = call.result?.moved
          flash(t('cc_crm.person.handed', 'Handed over: {enquiries} enquiries, {followUps} follow-ups, {orders} orders', { enquiries: moved?.enquiries ?? 0, followUps: moved?.followUps ?? 0, orders: moved?.orders ?? 0 }), 'success')
          setToName('')
          setStamp((value) => value + 1)
          await load()
          return true
        }}
      />
    </RecordPage>
  )
}

export default SalesPersonPage
