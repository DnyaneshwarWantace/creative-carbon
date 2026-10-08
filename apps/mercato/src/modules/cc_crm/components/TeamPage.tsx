"use client"

import * as React from 'react'
import { KeyRound, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { formatDateTime } from '../../cc_orders/components/format'

type CrmRole = 'manager' | 'sales'
type Member = { id: string; email: string; name: string | null; roles: string[]; crmRole: CrmRole | null; crmAccess: boolean; erpAccess: boolean; crmOnly: boolean; superAdmin: boolean; lastLoginAt: string | null; isSelf: boolean }

function strongPassword(): string {
  const pick = (chars: string, count: number) => Array.from(crypto.getRandomValues(new Uint32Array(count)), (value) => chars[value % chars.length]).join('')
  const raw = pick('ABCDEFGHJKLMNPQRSTUVWXYZ', 2) + pick('abcdefghijkmnpqrstuvwxyz', 5) + pick('23456789', 2) + pick('@#$%&*!', 1)
  return raw
    .split('')
    .sort(() => (crypto.getRandomValues(new Uint8Array(1))[0] > 127 ? 1 : -1))
    .join('')
}

function useTeamSend() {
  const { runMutation } = useGuardedMutation({ contextId: 'cc-crm-team' })
  return React.useCallback(
    async (method: 'POST' | 'PUT', body: Record<string, unknown>): Promise<{ items: Member[] } | null> => {
      const call = await runMutation({
        context: {},
        mutationPayload: { ...body, password: body.password ? '***' : undefined },
        operation: () => apiCall<{ items?: Member[]; error?: string }>('/api/cc_crm/team', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.items) {
        flash(call.result?.error ?? 'Could not save.', 'error')
        return null
      }
      return { items: call.result.items }
    },
    [runMutation],
  )
}

function AddDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (items: Member[]) => void }) {
  const t = useT()
  const send = useTeamSend()
  const [form, setForm] = React.useState({ name: '', email: '', password: '', crmRole: 'sales' as CrmRole })
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (open) setForm({ name: '', email: '', password: strongPassword(), crmRole: 'sales' })
  }, [open])
  const submit = async () => {
    if (busy) return
    if (form.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.password.length < 8) {
      flash(t('cc_crm.team.fill', 'Enter the name, a valid email and a password of at least 8 characters.'), 'error')
      return
    }
    setBusy(true)
    const result = await send('POST', form)
    setBusy(false)
    if (!result) return
    flash(t('cc_crm.team.added', '{name} can now log in at /crm with the password you set. Share it privately.', { name: form.name }), 'success')
    onSaved(result.items)
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('cc_crm.team.addTitle', 'Add a CRM user')}</DialogTitle>
          <DialogDescription>{t('cc_crm.team.addHint', 'They get a CRM-only login: they cannot open the ERP. ERP access is given by the ERP administrator.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">{t('cc_crm.team.name', 'Name')}</Label>
            <Input id="team-name" autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-email">{t('cc_crm.team.email', 'Email (login)')}</Label>
            <Input id="team-email" type="email" autoComplete="off" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="team-password">{t('cc_crm.team.password', 'Password')}</Label>
            <div className="flex gap-2">
              <Input id="team-password" className="font-mono" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
              <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: strongPassword() })}>
                {t('cc_crm.team.generate', 'New')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('cc_crm.team.passwordHint', 'At least 8 characters with a capital letter, a number and a symbol.')}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t('cc_crm.team.role', 'CRM role')}</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(['sales', 'manager'] as const).map((role) => (
                <button
                  key={role}
                  type="button"
                  role="radio"
                  aria-checked={form.crmRole === role}
                  onClick={() => setForm({ ...form, crmRole: role })}
                  className={cn('rounded-lg border p-3 text-left', form.crmRole === role ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50')}
                >
                  <span className="block text-sm font-medium">{role === 'manager' ? t('cc_crm.team.manager', 'CRM manager') : t('cc_crm.team.sales', 'Sales')}</span>
                  <span className="block text-xs text-muted-foreground">{role === 'manager' ? t('cc_crm.team.managerHint', 'Everything in the CRM, prices and this team page') : t('cc_crm.team.salesHint', 'Enquiries, quotations, customers, booking orders')}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? t('cc_crm.team.saving', 'Adding…') : t('cc_crm.team.add', 'Add user')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordDialog({ member, onClose, onSaved }: { member: Member | null; onClose: () => void; onSaved: (items: Member[]) => void }) {
  const t = useT()
  const send = useTeamSend()
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => {
    if (member) setPassword(strongPassword())
  }, [member])
  const submit = async () => {
    if (!member || busy) return
    setBusy(true)
    const result = await send('PUT', { action: 'password', id: member.id, password })
    setBusy(false)
    if (!result) return
    flash(t('cc_crm.team.passwordSet', 'New password set for {name}. Share it privately.', { name: member.name ?? member.email }), 'success')
    onSaved(result.items)
    onClose()
  }
  return (
    <Dialog open={Boolean(member)} onOpenChange={(value) => (!value ? onClose() : null)}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('cc_crm.team.resetTitle', 'New password for {name}', { name: member?.name ?? member?.email ?? '' })}</DialogTitle>
          <DialogDescription>{t('cc_crm.team.resetHint', 'Their current password stops working immediately.')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input className="font-mono" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-label={t('cc_crm.team.password', 'Password')} />
          <Button type="button" variant="outline" onClick={() => setPassword(strongPassword())}>
            {t('cc_crm.team.generate', 'New')}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy || password.length < 8}>
            {t('cc_crm.team.setPassword', 'Set password')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TeamPage() {
  const t = useT()
  const send = useTeamSend()
  const [items, setItems] = React.useState<Member[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [resetting, setResetting] = React.useState<Member | null>(null)
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    apiCall<{ items?: Member[] }>('/api/cc_crm/team').then((call) => {
      if (call.ok && call.result?.items) setItems(call.result.items)
      else setError(t('cc_crm.team.loadError', 'Could not load the team.'))
    })
  }, [t])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!items) return <Page><PageBody><PageLoading label={t('cc_crm.loading', 'Loading…')} /></PageBody></Page>

  const visible = showAll ? items : items.filter((member) => member.crmAccess)
  const changeRole = async (member: Member, value: string) => {
    const result = await send('PUT', { action: 'role', id: member.id, crmRole: value === 'none' ? null : value })
    if (result) {
      setItems(result.items)
      flash(t('cc_crm.team.roleSaved', 'Access updated for {name}', { name: member.name ?? member.email }), 'success')
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-5xl space-y-5 pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('cc_crm.home.title', 'CRM')}</p>
              <h1 className="text-xl font-semibold sm:text-2xl">{t('cc_crm.team.title', 'Team & access')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_crm.team.lede', 'Who can use the CRM and what they can do. Sales users log in at /crm.')}</p>
            </div>
            <Button type="button" onClick={() => setAdding(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_crm.team.addButton', 'Add CRM user')}
            </Button>
          </div>

          <Notice compact>{t('cc_crm.team.rules', 'You can give or remove CRM roles for anyone. ERP access and ERP users’ passwords are managed in the ERP.')}</Notice>

          <section className="rounded-xl border bg-card shadow-xs">
            <header className="flex items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
                {showAll ? t('cc_crm.team.everyone', 'Everyone ({count})', { count: visible.length }) : t('cc_crm.team.withAccess', 'With CRM access ({count})', { count: visible.length })}
              </h2>
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" className="h-3.5 w-3.5 rounded-sm border-input" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
                {t('cc_crm.team.showAll', 'Show everyone')}
              </label>
            </header>
            <ul className="divide-y">
              {visible.map((member) => (
                <li key={member.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold uppercase text-primary">{(member.name ?? member.email).slice(0, 1)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {member.name ?? member.email}
                        {member.isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">({t('cc_crm.team.you', 'you')})</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {member.email}
                        {member.lastLoginAt ? ` · ${t('cc_crm.team.lastLogin', 'last login {when}', { when: formatDateTime(member.lastLoginAt) })}` : ` · ${t('cc_crm.team.neverLogged', 'never logged in')}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {member.erpAccess ? <StatusBadge variant="info">{t('cc_crm.team.alsoErp', 'Also uses ERP')}</StatusBadge> : null}
                    {member.superAdmin ? (
                      <StatusBadge variant="neutral">
                        <ShieldCheck className="mr-1 inline h-3 w-3" aria-hidden="true" />
                        {t('cc_crm.team.superAdmin', 'Administrator')}
                      </StatusBadge>
                    ) : (
                      <div className="w-44">
                        <Dropdown size="sm" value={member.crmRole ?? 'none'} onChange={(event) => void changeRole(member, event.target.value)} aria-label={t('cc_crm.team.role', 'CRM role')}>
                          <option value="manager">{t('cc_crm.team.manager', 'CRM manager')}</option>
                          <option value="sales">{t('cc_crm.team.sales', 'Sales')}</option>
                          <option value="none">{member.crmAccess && !member.crmRole ? t('cc_crm.team.viaErp', 'Via ERP department') : t('cc_crm.team.noAccess', 'No CRM role')}</option>
                        </Dropdown>
                      </div>
                    )}
                    {member.crmOnly ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setResetting(member)}>
                        <KeyRound className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {t('cc_crm.team.reset', 'Password')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <AddDialog open={adding} onClose={() => setAdding(false)} onSaved={setItems} />
        <PasswordDialog member={resetting} onClose={() => setResetting(null)} onSaved={setItems} />
      </PageBody>
    </Page>
  )
}

export default TeamPage
