"use client"

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { IconButton } from '@open-mercato/ui/primitives/icon-button'
import { Input } from '@open-mercato/ui/primitives/input'
import { EmailInput } from '@open-mercato/ui/primitives/email-input'
import { PhoneNumberField, PHONE_COUNTRIES, type PhoneCountry } from '@open-mercato/ui/backend/inputs/PhoneNumberField'
import { TabEmptyState } from '@open-mercato/ui/backend/detail'

export type Translator = (
  key: string,
  fallback?: string,
  params?: Record<string, string | number>,
) => string

export type CustomerContactValue = {
  id: string
  name: string
  phone?: string | null
  email?: string | null
}

type ContactRowsProps = {
  contacts: CustomerContactValue[]
  onChange: (next: CustomerContactValue[]) => void
  t: Translator
  disabled?: boolean
  defaultCountryIso2?: string
  emptyLabel?: string
}

const resolvePhoneCountries = (defaultCountryIso2?: string): PhoneCountry[] | undefined => {
  if (defaultCountryIso2 !== 'IN') return undefined
  return PHONE_COUNTRIES.filter((country) => country.iso2 === 'IN')
}

function createContactId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`
}

export function ContactRows({
  contacts,
  onChange,
  t,
  disabled = false,
  defaultCountryIso2,
  emptyLabel,
}: ContactRowsProps) {
  const countries = resolvePhoneCountries(defaultCountryIso2)

  const updateRow = React.useCallback(
    (id: string, patch: Partial<CustomerContactValue>) => {
      onChange(contacts.map((row) => (row.id === id ? { ...row, ...patch } : row)))
    },
    [contacts, onChange],
  )

  const removeRow = React.useCallback(
    (id: string) => {
      onChange(contacts.filter((row) => row.id !== id))
    },
    [contacts, onChange],
  )

  const addRow = React.useCallback(() => {
    onChange([...contacts, { id: createContactId(), name: '', phone: '', email: '' }])
  }, [contacts, onChange])

  return (
    <div className="space-y-3">
      {contacts.length ? (
        <div className="space-y-3">
          {contacts.map((row, index) => (
            <div key={row.id} className="rounded-lg border border-border bg-card/50 p-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-3">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  {index === 0 ? (
                    <>
                      <span>Primary Contact</span>
                      <span className="text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Required</span>
                    </>
                  ) : (
                    <span>Contact #{index + 1}</span>
                  )}
                </span>
                {index > 0 && !disabled && (
                  <button
                    type="button"
                    aria-label={t('customers.companies.form.contacts.remove', 'Remove contact')}
                    onClick={() => removeRow(row.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t('common.remove', 'Remove')}</span>
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('customers.companies.form.contacts.fields.name', 'Name')}
                  </span>
                  <Input
                    value={row.name}
                    onChange={(event) => updateRow(row.id, { name: event.target.value })}
                    placeholder={t('customers.companies.form.contacts.fields.namePlaceholder', 'Contact name')}
                    disabled={disabled}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('customers.companies.form.contacts.fields.phone', 'Phone')}
                  </span>
                  <PhoneNumberField
                    value={row.phone ?? null}
                    onValueChange={(next) => updateRow(row.id, { phone: typeof next === 'string' ? next : '' })}
                    disabled={disabled}
                    placeholder={t('customers.companies.form.contacts.fields.phonePlaceholder', '+91 98765 43210')}
                    invalidLabel={t('customers.people.form.primaryPhone.invalid', 'Enter a valid phone number with country code (e.g. +1 212 555 1234)')}
                    minDigits={7}
                    defaultCountryIso2={defaultCountryIso2}
                    countries={countries}
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('customers.companies.form.contacts.fields.email', 'Email')}
                  </span>
                  <EmailInput
                    value={row.email ?? ''}
                    onChange={(event) => updateRow(row.id, { email: event.target.value })}
                    placeholder={t('customers.companies.form.contacts.fields.emailPlaceholder', 'name@example.com')}
                    disabled={disabled}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <TabEmptyState
          title={emptyLabel ?? t('customers.companies.form.contacts.empty', 'No contacts added yet')}
          action={{
            label: t('customers.companies.form.contacts.add', 'Add contact'),
            onClick: addRow,
            disabled,
          }}
        />
      )}
      {contacts.length ? (
        <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          {t('customers.companies.form.contacts.add', 'Add contact')}
        </Button>
      ) : null}
    </div>
  )
}
