'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeDetail } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { DEPARTMENT_TYPES } from '../../../data/validators'

export default function CreateDepartmentPage() {
  const t = useT()
  const router = useRouter()
  const { organizationId, tenantId } = useOrganizationScopeDetail()

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
            placeholder: t('cc_departments.form.field.namePlaceholder', 'e.g. Procurement'),
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
            defaultValue: true,
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
            placeholder: t('cc_departments.form.field.contactEmailPlaceholder', 'purchase@company.com'),
            helpText: t('cc_departments.form.field.contactEmailHelp', 'Shared inbox for this department, not a personal address.'),
          },
          {
            id: 'contactPhone',
            type: 'text',
            label: t('cc_departments.form.field.contactPhone', 'Shared phone (WhatsApp)'),
            placeholder: t('cc_departments.form.field.contactPhonePlaceholder', '+91 90000 00000'),
            helpText: t('cc_departments.form.field.contactPhoneHelp', 'Shared WhatsApp-enabled number for this department queue.'),
          },
        ],
      },
    ],
    [t]
  )

  return (
    <Page>
      <PageBody>
        <CrudForm
          title={t('cc_departments.create.title', 'Create department')}
          backHref="/backend/cc_departments"
          fields={[]}
          groups={groups}
          submitLabel={t('cc_departments.form.action.create', 'Create department')}
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
              organizationId,
              tenantId,
              name,
              type: values.type,
              contactEmail: contactEmail || null,
              contactPhone: values.contactPhone ? String(values.contactPhone).trim() : null,
              isActive: values.isActive !== false,
            }

            await createCrud('cc_departments/departments', payload)

            flash(t('cc_departments.flash.created', 'Department created'), 'success')
            router.push('/backend/cc_departments')
          }}
        />
      </PageBody>
    </Page>
  )
}
