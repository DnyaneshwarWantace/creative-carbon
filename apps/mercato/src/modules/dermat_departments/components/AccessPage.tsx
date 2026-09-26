"use client"

import * as React from 'react'
import { Check, Minus, Save, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Switch } from '@open-mercato/ui/primitives/switch'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ACCESS_AREAS, ROLE_LABELS, areaSummary, hasFeature, roleLabel, setAbility } from '../lib/access'

type Role = { id: string; name: string; usersCount: number; updatedAt: string | null }
type RoleAcl = { isSuperAdmin: boolean; features: string[]; organizations: string[] | null; updatedAt: string | null }
type Person = { id: string; email: string; name: string | null; roles: string[]; roleIds: string[]; isConfirmed: boolean; organizationId: string | null; updatedAt: string | null }
type Tab = 'matrix' | 'roles' | 'people'

const HIDDEN_ROLES = new Set(['superadmin'])

function roleOrder(name: string): number {
  const keys = Object.keys(ROLE_LABELS)
  const index = keys.indexOf(name)
  return index === -1 ? keys.length : index
}

function errorText(result: unknown, fallback: string): string {
  const body = result as { error?: string; message?: string } | null
  return body?.error ?? body?.message ?? fallback
}

function AddPersonDialog({ open, onOpenChange, roles, organizationId, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; roles: Role[]; organizationId: string | null; onSaved: () => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-access-add-person' })
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [role, setRole] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName('')
    setEmail('')
    setRole('')
  }, [open])

  const save = async () => {
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !role) {
      flash(t('dermat_departments.access.addMissing', 'Enter a name, a valid email and pick a department role.'), 'error')
      return
    }
    const body = { name: name.trim(), email: email.trim().toLowerCase(), roles: [role], sendInviteEmail: true, ...(organizationId ? { organizationId } : {}) }
    setSaving(true)
    try {
      const call = await runMutation({
        context: { resourceKind: 'auth.user', resourceId: 'new' },
        mutationPayload: body,
        operation: () => apiCall('/api/auth/users', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok) {
        flash(errorText(call.result, t('dermat_departments.access.addError', 'Could not add this person.')), 'error')
        return
      }
      flash(t('dermat_departments.access.added', '{name} added. They get an email to set their password.', { name: body.name }), 'success')
      onOpenChange(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('dermat_departments.access.addTitle', 'Add a person')}</DialogTitle>
          <DialogDescription>{t('dermat_departments.access.addHint', 'They get an invite email to set their own password. Their role decides which pages they see.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="person-name">{t('dermat_departments.access.name', 'Full name *')}</Label>
            <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="person-email">{t('dermat_departments.access.email', 'Work email *')}</Label>
            <Input id="person-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>{t('dermat_departments.access.role', 'Department role *')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue placeholder={t('dermat_departments.access.pickRole', 'Pick a role')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((entry) => (
                  <SelectItem key={entry.id} value={entry.name}>
                    {roleLabel(entry.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t('dermat_departments.access.adding', 'Adding…') : t('dermat_departments.access.add', 'Add and send invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AccessPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-access' })
  const [tab, setTab] = React.useState<Tab>('matrix')
  const [roles, setRoles] = React.useState<Role[] | null>(null)
  const [acls, setAcls] = React.useState<Record<string, RoleAcl>>({})
  const [people, setPeople] = React.useState<Person[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [roleId, setRoleId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<string[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const [roleCall, userCall] = await Promise.all([
      apiCall<{ items?: Role[]; error?: string }>('/api/auth/roles?pageSize=100'),
      apiCall<{ items?: Person[] }>('/api/auth/users?pageSize=100', undefined, { fallback: { items: [] } }),
    ])
    if (!roleCall.ok) {
      setLoadError(errorText(roleCall.result, t('dermat_departments.access.loadError', 'Could not load roles. You need the access-management permission.')))
      return
    }
    const list = (roleCall.result?.items ?? []).filter((role) => !HIDDEN_ROLES.has(role.name)).sort((a, b) => roleOrder(a.name) - roleOrder(b.name) || a.name.localeCompare(b.name))
    const aclCalls = await Promise.all(list.map((role) => apiCall<RoleAcl>(`/api/auth/roles/acl?roleId=${role.id}`, undefined, { fallback: { isSuperAdmin: false, features: [], organizations: null, updatedAt: null } })))
    const map: Record<string, RoleAcl> = {}
    list.forEach((role, index) => {
      map[role.id] = aclCalls[index].result ?? { isSuperAdmin: false, features: [], organizations: null, updatedAt: null }
    })
    setRoles(list)
    setAcls(map)
    setPeople(userCall.result?.items ?? [])
    setRoleId((current) => current ?? list[0]?.id ?? null)
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const selectedRole = roles?.find((role) => role.id === roleId) ?? null
  const selectedAcl = roleId ? acls[roleId] : undefined

  React.useEffect(() => {
    setDraft(null)
  }, [roleId])

  const features = draft ?? selectedAcl?.features ?? []
  const dirty = draft !== null && selectedAcl !== undefined && JSON.stringify([...draft].sort()) !== JSON.stringify([...selectedAcl.features].sort())

  const pickRole = (id: string) => {
    if (dirty && id !== roleId) {
      flash(t('dermat_departments.access.unsaved', 'Save or undo the changes to {role} first.', { role: selectedRole ? roleLabel(selectedRole.name) : '' }), 'error')
      return
    }
    setRoleId(id)
  }

  const saveRole = async () => {
    if (!selectedRole || !selectedAcl || !draft) return
    const body = { roleId: selectedRole.id, features: draft }
    setSaving(true)
    try {
      const request = () => apiCall('/api/auth/roles/acl', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'auth.role_acl', resourceId: selectedRole.id },
        mutationPayload: body,
        operation: () => (selectedAcl.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(selectedAcl.updatedAt), request) : request()),
      })
      if (!call.ok) {
        flash(call.status === 409 ? t('dermat_departments.access.conflict', 'Someone else changed this role. Reload to see their version.') : errorText(call.result, t('dermat_departments.access.saveError', 'Could not save this role.')), 'error')
        return
      }
      const fresh = await apiCall<RoleAcl>(`/api/auth/roles/acl?roleId=${selectedRole.id}`)
      if (fresh.ok && fresh.result) setAcls((prev) => ({ ...prev, [selectedRole.id]: fresh.result as RoleAcl }))
      setDraft(null)
      flash(t('dermat_departments.access.saved', '{role} saved. People with this role see the change when they next load a page.', { role: roleLabel(selectedRole.name) }), 'success')
    } finally {
      setSaving(false)
    }
  }

  const updatePerson = async (person: Person, patch: Record<string, unknown>, success: string) => {
    const body = { id: person.id, ...patch }
    const request = () => apiCall('/api/auth/users', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const call = await runMutation({
      context: { resourceKind: 'auth.user', resourceId: person.id },
      mutationPayload: body,
      operation: () => (person.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(person.updatedAt), request) : request()),
    })
    if (!call.ok) {
      flash(errorText(call.result, t('dermat_departments.access.personError', 'Could not change this person.')), 'error')
      return
    }
    flash(success, 'success')
    void load()
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
  if (!roles) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_departments.access.loading', 'Loading roles and people…')} />
        </PageBody>
      </Page>
    )
  }

  const peopleIn = (role: Role) => people.filter((person) => person.roleIds.includes(role.id))
  const orgId = people[0]?.organizationId ?? null

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_departments.access.title', 'Team & access')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('dermat_departments.access.lede', 'Each person gets one department role. The role decides which pages they see in the sidebar and what they can do there.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SegmentedControl value={tab} onValueChange={(value) => setTab(value as Tab)} aria-label={t('dermat_departments.access.view', 'View')}>
                <SegmentedControlItem value="matrix">{t('dermat_departments.access.tabMatrix', 'Who can do what')}</SegmentedControlItem>
                <SegmentedControlItem value="roles">{t('dermat_departments.access.tabRoles', 'Roles')}</SegmentedControlItem>
                <SegmentedControlItem value="people">{t('dermat_departments.access.tabPeople', 'People ({count})', { count: people.length })}</SegmentedControlItem>
              </SegmentedControl>
              <Button type="button" size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_departments.access.addPerson', 'Add person')}
              </Button>
            </div>
          </header>

          {people.length <= 1 ? (
            <div className="flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-text">
              <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t('dermat_departments.access.onlyOne', 'Only one person can sign in today, so work cannot be assigned by department. Add one person per department so tasks and the morning email reach the right people.')}</p>
            </div>
          ) : null}

          {tab === 'matrix' ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left font-semibold">{t('dermat_departments.access.area', 'Area')}</th>
                    {roles.map((role) => (
                      <th key={role.id} className="px-2 py-2 text-left font-semibold">
                        <button type="button" className="text-left hover:underline" onClick={() => { pickRole(role.id); setTab('roles') }}>
                          {roleLabel(role.name)}
                        </button>
                        <span className="block font-normal tabular-nums">{t('dermat_departments.access.peopleCount', '{count} people', { count: peopleIn(role).length })}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ACCESS_AREAS.map((area) => (
                    <tr key={area.key} className="align-top">
                      <th scope="row" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                        {area.label}
                        <span className="block text-xs font-normal text-muted-foreground">{area.pages}</span>
                      </th>
                      {roles.map((role) => {
                        const acl = acls[role.id]
                        const summary = areaSummary(acl?.features ?? [], Boolean(acl?.isSuperAdmin), area)
                        return (
                          <td key={role.id} className="px-2 py-2">
                            {summary.level === 'none' ? (
                              <Minus className="h-4 w-4 text-muted-foreground" aria-label={t('dermat_departments.access.noAccess', 'No access')} />
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {summary.granted.map((ability) => (
                                  <span key={ability.feature} title={ability.label} className={cn('rounded-sm px-1.5 py-0.5 text-xs', summary.level === 'all' ? 'bg-status-success-bg text-status-success-text' : 'bg-status-info-bg text-status-info-text')}>
                                    {ability.short}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {tab === 'roles' && selectedRole && selectedAcl ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <nav className="space-y-1 lg:col-span-3" aria-label={t('dermat_departments.access.roles', 'Roles')}>
                {roles.map((role) => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => pickRole(role.id)}
                    aria-current={role.id === roleId ? 'true' : undefined}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', role.id === roleId && 'bg-muted font-medium')}
                  >
                    <span className="truncate">{roleLabel(role.name)}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{peopleIn(role).length}</span>
                  </button>
                ))}
              </nav>
              <section className="space-y-4 lg:col-span-9">
                <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                      <ShieldCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      {roleLabel(selectedRole.name)}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {peopleIn(selectedRole).length
                        ? peopleIn(selectedRole).map((person) => person.name || person.email).join(', ')
                        : t('dermat_departments.access.nobody', 'Nobody has this role yet.')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setDraft(null)}>
                      {t('dermat_departments.access.undo', 'Undo changes')}
                    </Button>
                    <Button type="button" size="sm" disabled={!dirty || saving || selectedAcl.isSuperAdmin} onClick={() => void saveRole()}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {saving ? t('dermat_departments.access.saving', 'Saving…') : t('dermat_departments.access.save', 'Save role')}
                    </Button>
                  </div>
                </div>
                {selectedAcl.isSuperAdmin ? <p className="text-sm text-muted-foreground">{t('dermat_departments.access.superAdmin', 'This role can do everything and cannot be narrowed here.')}</p> : null}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {ACCESS_AREAS.map((area) => (
                    <fieldset key={area.key} className="space-y-2 rounded-lg border bg-card p-4">
                      <legend className="sr-only">{area.label}</legend>
                      <div>
                        <p className="text-sm font-semibold">{area.label}</p>
                        <p className="text-xs text-muted-foreground">{area.pages}</p>
                      </div>
                      {area.abilities.map((ability) => {
                        const id = `ability-${area.key}-${ability.feature}`
                        const checked = hasFeature(features, selectedAcl.isSuperAdmin, ability.feature)
                        return (
                          <div key={ability.feature} className="flex items-start gap-2">
                            <Checkbox
                              id={id}
                              checked={checked}
                              disabled={selectedAcl.isSuperAdmin}
                              onCheckedChange={(value) => setDraft(setAbility(features, ability.feature, value === true))}
                            />
                            <Label htmlFor={id} className="text-sm font-normal leading-5">
                              {ability.label}
                            </Label>
                          </div>
                        )
                      })}
                    </fieldset>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t('dermat_departments.access.dependHint', 'Switching off the first line of an area switches off the rest of that area, because every action there needs to see the records first.')}</p>
              </section>
            </div>
          ) : null}

          {tab === 'people' ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_departments.access.person', 'Person')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_departments.access.role', 'Department role')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_departments.access.canSee', 'Can open')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_departments.access.active', 'Can sign in')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {people.map((person) => {
                    const role = roles.find((entry) => person.roleIds.includes(entry.id))
                    const acl = role ? acls[role.id] : undefined
                    const areas = ACCESS_AREAS.filter((area) => areaSummary(acl?.features ?? [], Boolean(acl?.isSuperAdmin), area).level !== 'none')
                    return (
                      <tr key={person.id} className="align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{person.name || person.email}</p>
                          {person.name ? <p className="text-xs text-muted-foreground">{person.email}</p> : null}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={role?.name ?? ''}
                            onValueChange={(value) => void updatePerson(person, { roles: [value] }, t('dermat_departments.access.roleChanged', '{name} is now {role}', { name: person.name || person.email, role: roleLabel(value) }))}
                          >
                            <SelectTrigger className="h-8 w-52">
                              <SelectValue placeholder={t('dermat_departments.access.noRole', 'No role')} />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((entry) => (
                                <SelectItem key={entry.id} value={entry.name}>
                                  {roleLabel(entry.name)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {person.roles.length > 1 ? <p className="mt-1 text-xs text-muted-foreground">{t('dermat_departments.access.moreRoles', 'Also: {roles}', { roles: person.roles.filter((name) => name !== role?.name).map(roleLabel).join(', ') })}</p> : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{areas.length ? areas.map((area) => area.label).join(' · ') : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={person.isConfirmed}
                              aria-label={person.isConfirmed ? t('dermat_departments.access.deactivate', 'Stop {name} signing in', { name: person.email }) : t('dermat_departments.access.activate', 'Let {name} sign in', { name: person.email })}
                              onCheckedChange={(checked) =>
                                void updatePerson(
                                  person,
                                  { isConfirmed: checked },
                                  checked ? t('dermat_departments.access.activated', '{name} can sign in again', { name: person.email }) : t('dermat_departments.access.deactivated', '{name} can no longer sign in', { name: person.email }),
                                )
                              }
                            />
                            {person.isConfirmed ? <Check className="h-4 w-4 text-status-success-icon" aria-hidden="true" /> : <StatusBadge variant="neutral">{t('dermat_departments.access.off', 'Off')}</StatusBadge>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <AddPersonDialog open={addOpen} onOpenChange={setAddOpen} roles={roles} organizationId={orgId} onSaved={() => void load()} />
      </PageBody>
    </Page>
  )
}

export default AccessPage
