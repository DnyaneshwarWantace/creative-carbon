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
import { VENDOR_CATEGORIES } from '../../../data/validators'
import { VENDOR_CATEGORY_LABEL } from '../../../lib/categories'

export default function CreateVendorPage() {
  const t = useT()
  const router = useRouter()
  const { organizationId, tenantId } = useOrganizationScopeDetail()

  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'basic',
        column: 1,
        title: t('cc_vendors.form.group.details', 'Vendor details'),
        fields: [
          {
            id: 'name',
            type: 'text',
            label: t('cc_vendors.form.field.name', 'Name'),
            placeholder: t('cc_vendors.form.field.namePlaceholder', 'e.g. Sunshine Chemicals Pvt Ltd'),
            required: true,
          },
          {
            id: 'code',
            type: 'text',
            label: t('cc_vendors.form.field.code', 'Vendor code'),
            placeholder: t('cc_vendors.form.field.codePlaceholder', 'Optional internal code'),
          },
          {
            id: 'gstNumber',
            type: 'text',
            label: t('cc_vendors.form.field.gstNumber', 'GST number'),
            placeholder: t('cc_vendors.form.field.gstNumberPlaceholder', '27AAAAA0000A1Z5'),
          },
          {
            id: 'category',
            type: 'select',
            label: t('cc_vendors.form.field.category', 'Category'),
            options: VENDOR_CATEGORIES.map((category) => ({ label: t(`cc_vendors.category.${category}`, VENDOR_CATEGORY_LABEL[category]), value: category })),
          },
          {
            id: 'paymentTerms',
            type: 'text',
            label: t('cc_vendors.form.field.paymentTerms', 'Payment terms'),
            placeholder: t('cc_vendors.form.field.paymentTermsPlaceholder', 'e.g. Net 30, Advance'),
          },
          {
            id: 'isActive',
            type: 'checkbox',
            label: t('cc_vendors.form.field.isActive', 'Active'),
            defaultValue: true,
          },
        ],
      },
      {
        id: 'contact',
        column: 2,
        title: t('cc_vendors.form.group.contact', 'Contact details'),
        fields: [
          {
            id: 'contactPerson',
            type: 'text',
            label: t('cc_vendors.form.field.contactPerson', 'Contact person'),
            placeholder: t('cc_vendors.form.field.contactPersonPlaceholder', 'e.g. Rakesh Sharma'),
          },
          {
            id: 'contactPhone',
            type: 'text',
            label: t('cc_vendors.form.field.contactPhone', 'Contact phone'),
            placeholder: t('cc_vendors.form.field.contactPhonePlaceholder', '+91 90000 00000'),
          },
          {
            id: 'contactEmail',
            type: 'text',
            label: t('cc_vendors.form.field.contactEmail', 'Contact email'),
            placeholder: t('cc_vendors.form.field.contactEmailPlaceholder', 'vendor@example.com'),
          },
          {
            id: 'address',
            type: 'textarea',
            label: t('cc_vendors.form.field.address', 'Address'),
            placeholder: t('cc_vendors.form.field.addressPlaceholder', 'Vendor address'),
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
          title={t('cc_vendors.create.title', 'Create vendor')}
          backHref="/backend/cc_vendors"
          fields={[]}
          groups={groups}
          submitLabel={t('cc_vendors.form.action.create', 'Create vendor')}
          cancelHref="/backend/cc_vendors"
          onSubmit={async (values) => {
            const name = String(values.name || '').trim()
            if (!name) {
              throw createCrudFormError(t('cc_vendors.form.errors.nameRequired', 'Name is required'), {
                name: t('cc_vendors.form.errors.nameRequired', 'Name is required'),
              })
            }

            const payload = {
              organizationId,
              tenantId,
              name,
              code: values.code ? String(values.code).trim() : null,
              gstNumber: values.gstNumber ? String(values.gstNumber).trim() : null,
              contactPerson: values.contactPerson ? String(values.contactPerson).trim() : null,
              contactPhone: values.contactPhone ? String(values.contactPhone).trim() : null,
              contactEmail: values.contactEmail ? String(values.contactEmail).trim() : null,
              address: values.address ? String(values.address).trim() : null,
              paymentTerms: values.paymentTerms ? String(values.paymentTerms).trim() : null,
              category: values.category ? String(values.category).trim() : null,
              isActive: values.isActive !== false,
            }

            await createCrud('cc_vendors/vendors', payload)

            flash(t('cc_vendors.flash.created', 'Vendor created'), 'success')
            router.push('/backend/cc_vendors')
          }}
        />
      </PageBody>
    </Page>
  )
}
