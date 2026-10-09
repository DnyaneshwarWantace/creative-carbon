"use client"

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, FileText, Home, Inbox, LayoutGrid, ListChecks, Package, Users } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { useGranted } from './useGranted'
import type { Workspace } from '../lib/workspace'

type Tab = { key: string; href: string; label: string; icon: React.ComponentType<{ className?: string }>; feature?: string; active: (path: string) => boolean }

const FORM_PATTERNS = [/\/new(\/|$)/, /\/edit(\/|$)/, /\/create(\/|$)/, /\/import(\/|$)/]

export function hidesTabBar(pathname: string | null | undefined): boolean {
  const path = pathname ?? ''
  return FORM_PATTERNS.some((pattern) => pattern.test(path))
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function openMenu(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  button?.click()
}

export function MobileTabBar({ workspace }: { workspace: Workspace }) {
  const t = useT()
  const pathname = usePathname() ?? ''
  const granted = useGranted()
  if (hidesTabBar(pathname)) return null

  const tabs: Tab[] =
    workspace === 'crm'
      ? [
          { key: 'home', href: '/backend/crm', label: t('cc_ui.tab.home', 'Home'), icon: Home, feature: 'cc_crm.view', active: (path) => path === '/backend/crm' },
          { key: 'enquiries', href: '/backend/crm/enquiries', label: t('cc_ui.tab.enquiries', 'Enquiries'), icon: Inbox, feature: 'cc_crm.view', active: (path) => under(path, '/backend/crm/enquiries') },
          { key: 'quotations', href: '/backend/crm/quotations', label: t('cc_ui.tab.quotes', 'Quotes'), icon: FileText, feature: 'cc_crm.view', active: (path) => under(path, '/backend/crm/quotations') },
          { key: 'customers', href: '/backend/customers/companies', label: t('cc_ui.tab.customers', 'Customers'), icon: Users, feature: 'customers.companies.manage', active: (path) => under(path, '/backend/customers') },
        ]
      : [
          { key: 'home', href: '/backend', label: t('cc_ui.tab.home', 'Home'), icon: Home, active: (path) => path === '/backend' || under(path, '/backend/overview') || under(path, '/backend/owner') },
          { key: 'work', href: '/backend/my-work', label: t('cc_ui.tab.work', 'My work'), icon: ListChecks, feature: 'cc_dashboard.my_work', active: (path) => under(path, '/backend/my-work') || under(path, '/backend/work') },
          { key: 'orders', href: '/backend/orders', label: t('cc_ui.tab.orders', 'Orders'), icon: ClipboardList, feature: 'cc_orders.view', active: (path) => under(path, '/backend/orders') },
          { key: 'stock', href: '/backend/stock', label: t('cc_ui.tab.stock', 'Stock'), icon: Package, feature: 'cc_store.view', active: (path) => under(path, '/backend/stock') || under(path, '/backend/store') },
        ]
  const visible = tabs.filter((tab) => !tab.feature || !granted.ready || granted.has(tab.feature))
  const menuLabel = t('appShell.openMenu', 'Open menu')

  return (
    <nav aria-label={t('cc_ui.tab.nav', 'Main')} className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden">
      <ul className="mx-auto flex max-w-xl items-stretch justify-around">
        {visible.map((tab) => {
          const active = tab.active(pathname)
          const Icon = tab.icon
          return (
            <li key={tab.key} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={cn('flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-xs transition-colors', active ? 'font-semibold text-primary' : 'text-muted-foreground active:text-foreground')}
              >
                <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-primary/10')}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="truncate">{tab.label}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex-1">
          <button type="button" onClick={() => openMenu(menuLabel)} className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 px-1 text-xs text-muted-foreground active:text-foreground">
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <LayoutGrid className="h-5 w-5" />
            </span>
            <span>{t('cc_ui.tab.more', 'More')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}

export default MobileTabBar
