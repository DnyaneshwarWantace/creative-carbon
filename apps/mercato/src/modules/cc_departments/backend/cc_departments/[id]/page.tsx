'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RecordNotFoundState, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { AclEditor, type AclData } from '@open-mercato/core/modules/auth/components/AclEditor'
import { DEPARTMENT_TYPES } from '../../../data/validators'

type DepartmentData = {
  id: string
  name: string
  type: string
  contact_email: string | null
  contact_phone: string | null
  role_id: string | null
  is_active: boolean
  organization_id: string
  tenant_id: string
  updated_at?: string | null
}

type RoleLookupResponse = {
  isSuperAdmin?: boolean
}

export default function EditDepartmentPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const router = useRouter()

  const [department, setDepartment] = React.useState<DepartmentData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isNotFound, setIsNotFound] = React.useState(false)
  const [aclData, setAclData] = React.useState<AclData>({ isSuperAdmin: false, features: [], organizations: null })
  const [aclUpdatedAt, setAclUpdatedAt] = React.useState<string | null>(null)
  const [actorIsSuperAdmin, setActorIsSuperAdmin] = React.useState(false)

  React.useEffect(() => {
    async function loadDepartment() {
      try {
        const response = await apiCall<{ items: DepartmentData[] }>(`/api/cc_departments/departments?id=${params?.id}`)
        if (response.ok && response.result && response.result.items.length > 0) {
          const found = response.result.items[0]
          setDepartment(found)
          if (found.role_id) {
            const roleCheck = await apiCall<RoleLookupResponse>(
              `/api/auth/roles?id=${encodeURIComponent(found.role_id)}`,
              undefined,
              { fallback: { isSuperAdmin: false } },
            )
            setActorIsSuperAdmin(Boolean(roleCheck.result?.isSuperAdmin))
          }
        } else if (!response.ok) {
          setError(t('cc_departments.form.errors.load', 'Failed to load department'))
        } else {
          setIsNotFound(true)
        }
      } catch (err) {
        setError(t('cc_departments.form.errors.load', 'Failed to load department'))
      } finally {
        setLoading(false)
      }
    }
    loadDepartment()
  }, [params, t])

  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'basic',
        column: 1,
        title: t('cc_departments.form.group.details', 'Department details'),
        fields: [
          {
            id: 'name',
            type: 'text',
            label: t('cc_departments.form.field.name', 'Name'),
            required: true,
          },
          {
            id: 'type',
            type: 'select',
            label: t('cc_departments.form.field.type', 'Type'),
            required: true,
            options: DEPARTMENT_TYPES.map((type) => ({ label: type, value: type })),
          },
          {
            id: 'isActive',
            type: 'checkbox',
            label: t('cc_departments.form.field.isActive', 'Active'),
          },
        ],
      },
      {
        id: 'contact',
        column: 2,
        title: t('cc_departments.form.group.contact', 'Shared contact (department queue)'),
        fields: [
          {
            id: 'contactEmail',
            type: 'text',
            label: t('cc_departments.form.field.contactEmail', 'Shared email'),
            helpText: t('cc_departments.form.field.contactEmailHelp', 'Shared inbox for this department, not a personal address.'),
          },
          {
            id: 'contactPhone',
            type: 'text',
            label: t('cc_departments.form.field.contactPhone', 'Shared phone (WhatsApp)'),
            helpText: t('cc_departments.form.field.contactPhoneHelp', 'Shared WhatsApp-enabled number for this department queue.'),
          },
        ],
      },
      {
        id: 'access',
        column: 1,
        title: t('cc_departments.form.group.access', 'Access'),
        component: () => {
          if (!department?.role_id) {
            return (
              <div className="text-sm text-muted-foreground">
                {t('cc_departments.form.access.pending', 'Access controls are not available for this department yet.')}
              </div>
            )
          }
          return (
            <AclEditor
              kind="role"
              targetId={department.role_id}
              canEditOrganizations
              value={aclData}
              onChange={setAclData}
              onVersionChange={setAclUpdatedAt}
              currentUserIsSuperAdmin={actorIsSuperAdmin}
              tenantId={department.tenant_id ?? null}
              preserveOnTenantChange
            />
          )
        },
      },
    ],
    [t, department, aclData, actorIsSuperAdmin]
  )

  if (loading) {
    return (
      <Page>
        <PageBody>
          <div className="flex items-center justify-center p-8">
            <div className="text-muted-foreground">{t('cc_departments.form.loading', 'Loading...')}</div>
          </div>
        </PageBody>
      </Page>
    )
  }

  if (isNotFound) {
    return (
      <Page>
        <PageBody>
          <RecordNotFoundState
            label={t('cc_departments.form.errors.notFound', 'Department not found.')}
            backHref="/backend/cc_departments"
            backLabel={t('cc_departments.form.actions.backToList', 'Back to departments')}
          />
        </PageBody>
      </Page>
    )
  }

  if (error || !department) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error ?? t('cc_departments.form.errors.notFound', 'Department not found.')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <CrudForm
          title={t('cc_departments.edit.title', 'Edit department')}
          backHref="/backend/cc_departments"
          versionHistory={{ resourceKind: 'cc_departments.department', resourceId: department.id }}
          fields={[]}
          groups={groups}
          optimisticLockUpdatedAt={department.updated_at ?? null}
          initialValues={{
            name: department.name,
            type: department.type,
            contactEmail: department.contact_email || '',
            contactPhone: department.contact_phone || '',
            isActive: department.is_active,
          }}
          submitLabel={t('cc_departments.form.action.save', 'Save changes')}
          cancelHref="/backend/cc_departments"
          onSubmit={async (values) => {
            const name = String(values.name || '').trim()
            if (!name) {
              throw createCrudFormError(t('cc_departments.form.errors.nameRequired', 'Name is required'), {
                name: t('cc_departments.form.errors.nameRequired', 'Name is required'),
              })
            }
            const contactEmail = values.contactEmail ? String(values.contactEmail).trim() : ''
            if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
              throw createCrudFormError(t('cc_departments.form.errors.contactEmailInvalid', 'Enter a valid email address'), {
                contactEmail: t('cc_departments.form.errors.contactEmailInvalid', 'Enter a valid email address'),
              })
            }

            const payload = {
              id: department.id,
              name,
              type: values.type,
              contactEmail: contactEmail || null,
              contactPhone: values.contactPhone ? String(values.contactPhone).trim() : null,
              isActive: values.isActive !== false,
            }

            await updateCrud('cc_departments/departments', payload)

            if (department.role_id) {
              const aclLockHeader = buildOptimisticLockHeader(aclUpdatedAt)
              const saveRoleAcl = () => updateCrud('auth/roles/acl', { roleId: department.role_id, tenantId: department.tenant_id, ...aclData }, {
                errorMessage: t('cc_departments.form.errors.aclUpdate', 'Failed to update department access control'),
              })
              if (Object.keys(aclLockHeader).length > 0) {
                await withScopedApiRequestHeaders(aclLockHeader, saveRoleAcl)
              } else {
                await saveRoleAcl()
              }
            }

            flash(t('cc_departments.flash.updated', 'Department updated'), 'success')
            router.push('/backend/cc_departments')
          }}
        />
      </PageBody>
    </Page>
  )
}
