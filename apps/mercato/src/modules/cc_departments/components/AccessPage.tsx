"use client"

import * as React from 'react'
import { Check, Minus, Save, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
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
import { PageLoading } from '../../cc_ui/components/PageLoading'

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

type PersonDialogState = { person: Person | null } | null

function PersonDialog({ state, onClose, roles, acls, organizationId, onSaved }: { state: PersonDialogState; onClose: () => void; roles: Role[]; acls: Record<string, RoleAcl>; organizationId: string | null; onSaved: () => void }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-access-person' })
  const person = state?.person ?? null
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [roleNames, setRoleNames] = React.useState<string[]>([])
  const [custom, setCustom] = React.useState(false)
  const [features, setFeatures] = React.useState<string[]>([])
  const [aclVersion, setAclVersion] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const roleFeatures = React.useCallback(
    (names: string[]) => {
      const set = new Set<string>()
      for (const role of roles.filter((entry) => names.includes(entry.name))) for (const feature of acls[role.id]?.features ?? []) set.add(feature)
      return [...set]
    },
    [roles, acls],
  )

  React.useEffect(() => {
    if (!state) return
    setName(person?.name ?? '')
    setEmail(person?.email ?? '')
    setRoleNames(person?.roles ?? [])
    setCustom(false)
    setFeatures(roleFeatures(person?.roles ?? []))
    setAclVersion(null)
    if (!person) return
    setLoading(true)
    apiCall<{ hasCustomAcl?: boolean; features?: string[]; updatedAt?: string | null }>(`/api/auth/users/acl?userId=${person.id}`, undefined, { fallback: { hasCustomAcl: false } })
      .then((call) => {
        if (call.result?.hasCustomAcl) {
          setCustom(true)
          setFeatures(call.result.features ?? [])
          setAclVersion(call.result.updatedAt ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [state, person, roleFeatures])

  if (!state) return null

  const toggleRole = (roleName: string, checked: boolean) => {
    const next = checked ? [...roleNames, roleName] : roleNames.filter((entry) => entry !== roleName)
    setRoleNames(next)
    if (!custom) setFeatures(roleFeatures(next))
  }

  const save = async () => {
    if (!name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      flash(t('cc_departments.access.addMissing', 'Enter a name and a valid email.'), 'error')
      return
    }
    if (!roleNames.length) {
      flash(t('cc_departments.access.pickRoleError', 'Pick at least one department role.'), 'error')
      return
    }
    setSaving(true)
    try {
      let userId = person?.id ?? null
      const userBody = person
        ? { id: person.id, name: name.trim(), roles: roleNames }
        : { name: name.trim(), email: email.trim().toLowerCase(), roles: roleNames, sendInviteEmail: true, ...(organizationId ? { organizationId } : {}) }
      const request = () => apiCall<{ id?: string; error?: string }>('/api/auth/users', { method: person ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(userBody) })
      const userCall = await runMutation({
        context: { resourceKind: 'auth.user', resourceId: person?.id ?? 'new' },
        mutationPayload: userBody,
        operation: () => (person?.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(person.updatedAt), request) : request()),
      })
      if (!userCall.ok) {
        flash(errorText(userCall.result, t('cc_departments.access.personError', 'Could not save this person.')), 'error')
        return
      }
      userId = userId ?? userCall.result?.id ?? null
      if (userId && (custom || person)) {
        const aclBody = { userId, features: custom ? features : [] }
        const aclRequest = () => apiCall('/api/auth/users/acl', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(aclBody) })
        const aclCall = await runMutation({
          context: { resourceKind: 'auth.user_acl', resourceId: userId },
          mutationPayload: aclBody,
          operation: () => (aclVersion ? withScopedApiRequestHeaders(buildOptimisticLockHeader(aclVersion), aclRequest) : aclRequest()),
        })
        if (!aclCall.ok) {
          flash(errorText(aclCall.result, t('cc_departments.access.aclError', 'Person saved, but their personal access could not be saved.')), 'error')
          onSaved()
          return
        }
      }
      flash(
        person
          ? t('cc_departments.access.personSaved', '{name} saved. They see the change on their next page load.', { name: name.trim() })
          : t('cc_departments.access.added', '{name} added. They get an email to set their password.', { name: name.trim() }),
        'success',
      )
      onClose()
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        className="max-h-screen overflow-y-auto sm:max-w-3xl"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{person ? t('cc_departments.access.editPerson', 'Edit {name}', { name: person.name || person.email }) : t('cc_departments.access.addTitle', 'Add a person')}</DialogTitle>
          <DialogDescription>
            {t('cc_departments.access.personHint', 'Give one or more department roles. Their access is what those roles allow, unless you switch on custom access for this person.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="person-name">{t('cc_departments.access.name', 'Full name *')}</Label>
              <Input id="person-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="person-email">{t('cc_departments.access.email', 'Work email *')}</Label>
              <Input id="person-email" type="email" value={email} disabled={Boolean(person)} onChange={(event) => setEmail(event.target.value)} />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('cc_departments.access.rolesLegend', 'Department roles *')}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {roles.map((role) => {
                const id = `person-role-${role.id}`
                return (
                  <div key={role.id} className="flex items-center gap-2">
                    <Checkbox id={id} checked={roleNames.includes(role.name)} onCheckedChange={(value) => toggleRole(role.name, value === true)} />
                    <Label htmlFor={id} className="text-sm font-normal">
                      {roleLabel(role.name)}
                    </Label>
                  </div>
                )
              })}
            </div>
          </fieldset>
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{t('cc_departments.access.customTitle', 'Custom access for this person')}</p>
                <p className="text-xs text-muted-foreground">
                  {custom
                    ? t('cc_departments.access.customOn', 'Only the ticks below apply to this person. Role changes no longer affect them.')
                    : t('cc_departments.access.customOff', 'Off: this person gets exactly what their roles allow (shown below).')}
                </p>
              </div>
              <Switch
                checked={custom}
                disabled={loading}
                aria-label={t('cc_departments.access.customToggle', 'Custom access for this person')}
                onCheckedChange={(checked) => {
                  setCustom(checked)
                  if (!checked) setFeatures(roleFeatures(roleNames))
                }}
              />
            </div>
            {loading ? (
              <p className="text-xs text-muted-foreground">{t('cc_departments.access.loadingAccess', 'Loading their access…')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {ACCESS_AREAS.map((area) => (
                  <fieldset key={area.key} className="space-y-1.5 rounded-md border p-3">
                    <legend className="px-1 text-xs font-semibold">{area.label}</legend>
                    {area.abilities.map((ability) => {
                      const id = `person-${area.key}-${ability.feature}`
                      return (
                        <div key={ability.feature} className="flex items-start gap-2">
                          <Checkbox id={id} checked={hasFeature(features, false, ability.feature)} disabled={!custom} onCheckedChange={(value) => setFeatures(setAbility(features, ability.feature, value === true))} />
                          <Label htmlFor={id} className="text-xs font-normal leading-4">
                            {ability.label}
                          </Label>
                        </div>
                      )
                    })}
                  </fieldset>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || loading}>
            {saving ? t('cc_departments.access.saving', 'Saving…') : person ? t('cc_departments.access.savePerson', 'Save person') : t('cc_departments.access.add', 'Add and send invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AccessPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-access' })
  const [tab, setTab] = React.useState<Tab>('matrix')
  const [roles, setRoles] = React.useState<Role[] | null>(null)
  const [acls, setAcls] = React.useState<Record<string, RoleAcl>>({})
  const [people, setPeople] = React.useState<Person[]>([])
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [roleId, setRoleId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<string[] | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [personDialog, setPersonDialog] = React.useState<PersonDialogState>(null)
  const [personal, setPersonal] = React.useState<Record<string, string[]>>({})

  const load = React.useCallback(async () => {
    const [roleCall, userCall] = await Promise.all([
      apiCall<{ items?: Role[]; error?: string }>('/api/auth/roles?pageSize=100'),
      apiCall<{ items?: Person[] }>('/api/auth/users?pageSize=100', undefined, { fallback: { items: [] } }),
    ])
    if (!roleCall.ok) {
      setLoadError(errorText(roleCall.result, t('cc_departments.access.loadError', 'Could not load roles. You need the access-management permission.')))
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
    const personList = userCall.result?.items ?? []
    setPeople(personList)
    const personalCalls = await Promise.all(personList.map((person) => apiCall<{ hasCustomAcl?: boolean; features?: string[] }>(`/api/auth/users/acl?userId=${person.id}`, undefined, { fallback: { hasCustomAcl: false } })))
    const personalMap: Record<string, string[]> = {}
    personList.forEach((person, index) => {
      if (personalCalls[index].result?.hasCustomAcl) personalMap[person.id] = personalCalls[index].result?.features ?? []
    })
    setPersonal(personalMap)
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
      flash(t('cc_departments.access.unsaved', 'Save or undo the changes to {role} first.', { role: selectedRole ? roleLabel(selectedRole.name) : '' }), 'error')
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
        flash(call.status === 409 ? t('cc_departments.access.conflict', 'Someone else changed this role. Reload to see their version.') : errorText(call.result, t('cc_departments.access.saveError', 'Could not save this role.')), 'error')
        return
      }
      const fresh = await apiCall<RoleAcl>(`/api/auth/roles/acl?roleId=${selectedRole.id}`)
      if (fresh.ok && fresh.result) setAcls((prev) => ({ ...prev, [selectedRole.id]: fresh.result as RoleAcl }))
      setDraft(null)
      flash(t('cc_departments.access.saved', '{role} saved. People with this role see the change when they next load a page.', { role: roleLabel(selectedRole.name) }), 'success')
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
      flash(errorText(call.result, t('cc_departments.access.personError', 'Could not change this person.')), 'error')
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
          <PageLoading label={t('cc_departments.access.loading', 'Loading roles and people…')} />
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
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_departments.access.title', 'Team & access')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_departments.access.lede', 'Each person gets one department role. The role decides which pages they see in the sidebar and what they can do there.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <SegmentedControl value={tab} onValueChange={(value) => setTab(value as Tab)} aria-label={t('cc_departments.access.view', 'View')}>
                <SegmentedControlItem value="matrix">{t('cc_departments.access.tabMatrix', 'Who can do what')}</SegmentedControlItem>
                <SegmentedControlItem value="roles">{t('cc_departments.access.tabRoles', 'Roles')}</SegmentedControlItem>
                <SegmentedControlItem value="people">{t('cc_departments.access.tabPeople', 'People ({count})', { count: people.length })}</SegmentedControlItem>
              </SegmentedControl>
              <Button type="button" size="sm" onClick={() => setPersonDialog({ person: null })}>
                <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_departments.access.addPerson', 'Add person')}
              </Button>
            </div>
          </header>

          {people.length <= 1 ? (
            <div className="flex items-start gap-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-text">
              <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>{t('cc_departments.access.onlyOne', 'Only one person can sign in today, so work cannot be assigned by department. Add one person per department so tasks and the morning email reach the right people.')}</p>
            </div>
          ) : null}

          {tab === 'matrix' ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 bg-muted/40 px-3 py-2 text-left font-semibold">{t('cc_departments.access.area', 'Area')}</th>
                    {roles.map((role) => (
                      <th key={role.id} className="px-2 py-2 text-left font-semibold">
                        <button type="button" className="text-left hover:underline" onClick={() => { pickRole(role.id); setTab('roles') }}>
                          {roleLabel(role.name)}
                        </button>
                        <span className="block font-normal tabular-nums">{t('cc_departments.access.peopleCount', '{count} people', { count: peopleIn(role).length })}</span>
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
                              <Minus className="h-4 w-4 text-muted-foreground" aria-label={t('cc_departments.access.noAccess', 'No access')} />
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
              <nav className="space-y-1 lg:col-span-3" aria-label={t('cc_departments.access.roles', 'Roles')}>
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
                        : t('cc_departments.access.nobody', 'Nobody has this role yet.')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!dirty || saving} onClick={() => setDraft(null)}>
                      {t('cc_departments.access.undo', 'Undo changes')}
                    </Button>
                    <Button type="button" size="sm" disabled={!dirty || saving || selectedAcl.isSuperAdmin} onClick={() => void saveRole()}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {saving ? t('cc_departments.access.saving', 'Saving…') : t('cc_departments.access.save', 'Save role')}
                    </Button>
                  </div>
                </div>
                {selectedAcl.isSuperAdmin ? <p className="text-sm text-muted-foreground">{t('cc_departments.access.superAdmin', 'This role can do everything and cannot be narrowed here.')}</p> : null}
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
                <p className="text-xs text-muted-foreground">{t('cc_departments.access.dependHint', 'Switching off the first line of an area switches off the rest of that area, because every action there needs to see the records first.')}</p>
              </section>
            </div>
          ) : null}

          {tab === 'people' ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_departments.access.person', 'Person')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_departments.access.rolesCol', 'Department roles')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_departments.access.canSee', 'Can open')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_departments.access.active', 'Can sign in')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {people.map((person) => {
                    const personRoles = roles.filter((entry) => person.roleIds.includes(entry.id))
                    const custom = personal[person.id]
                    const effective = custom ?? [...new Set(personRoles.flatMap((entry) => acls[entry.id]?.features ?? []))]
                    const superAdmin = !custom && personRoles.some((entry) => acls[entry.id]?.isSuperAdmin)
                    const areas = ACCESS_AREAS.filter((area) => areaSummary(effective, superAdmin, area).level !== 'none')
                    return (
                      <tr key={person.id} className="align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium">{person.name || person.email}</p>
                          {person.name ? <p className="text-xs text-muted-foreground">{person.email}</p> : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {personRoles.length ? (
                              personRoles.map((entry) => (
                                <span key={entry.id} className="rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                                  {roleLabel(entry.name)}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-status-warning-text">{t('cc_departments.access.noRole', 'No role')}</span>
                            )}
                          </div>
                          {custom ? <StatusBadge variant="info">{t('cc_departments.access.customBadge', 'Custom access')}</StatusBadge> : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{areas.length ? areas.map((area) => area.label).join(' · ') : '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={person.isConfirmed}
                              aria-label={person.isConfirmed ? t('cc_departments.access.deactivate', 'Stop {name} signing in', { name: person.email }) : t('cc_departments.access.activate', 'Let {name} sign in', { name: person.email })}
                              onCheckedChange={(checked) =>
                                void updatePerson(
                                  person,
                                  { isConfirmed: checked },
                                  checked ? t('cc_departments.access.activated', '{name} can sign in again', { name: person.email }) : t('cc_departments.access.deactivated', '{name} can no longer sign in', { name: person.email }),
                                )
                              }
                            />
                            {person.isConfirmed ? <Check className="h-4 w-4 text-status-success-icon" aria-hidden="true" /> : <StatusBadge variant="neutral">{t('cc_departments.access.off', 'Off')}</StatusBadge>}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => setPersonDialog({ person })}>
                            {t('cc_departments.access.edit', 'Edit')}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        <PersonDialog state={personDialog} onClose={() => setPersonDialog(null)} roles={roles} acls={acls} organizationId={orgId} onSaved={() => void load()} />
      </PageBody>
    </Page>
  )
}

export default AccessPage
