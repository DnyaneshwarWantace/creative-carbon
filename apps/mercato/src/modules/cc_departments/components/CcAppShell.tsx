"use client"

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { AppShell } from '@open-mercato/ui/backend/AppShell'
import { CRM_HOME, ERP_HOME, allowedOn, homeFor, pathKind, workspaceOf, type Workspace, type WorkspaceAccess } from '../lib/workspace'
import { WorkspaceDenied } from './WorkspaceDenied'
import { MobileTabBar, hidesTabBar } from './MobileTabBar'
import { usePlantPwa } from '../../cc_production/components/offline'

type AppShellProps = React.ComponentProps<typeof AppShell>

const SEEDED_KEY = 'cc:sidebarFolded'

function useFoldSidebarOnFirstVisit(pathname: string | null) {
  React.useEffect(() => {
    let seeded = true
    try {
      seeded = Boolean(window.localStorage.getItem(SEEDED_KEY))
    } catch {
      return
    }
    if (seeded) return
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const nav = document.querySelector('nav[data-testid="sidebar"]')
      const headers = nav ? Array.from(nav.querySelectorAll<HTMLButtonElement>(':scope > div > button[aria-expanded="true"]')) : []
      if (headers.length < 3 && attempts < 40) return
      window.clearInterval(timer)
      for (const header of headers) {
        const section = header.parentElement
        const links = section ? Array.from(section.querySelectorAll<HTMLAnchorElement>('a[href]')) : []
        const current = links.some((link) => {
          const href = link.getAttribute('href') ?? ''
          return href !== '/backend' && (pathname === href || (pathname ?? '').startsWith(`${href}/`))
        })
        if (!current) header.click()
      }
      try {
        window.localStorage.setItem(SEEDED_KEY, '1')
      } catch {
        return
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [pathname])
}

function WorkspaceLink({ workspace, access }: { workspace: Workspace; access: WorkspaceAccess }) {
  const t = useT()
  const other: Workspace = workspace === 'crm' ? 'erp' : 'crm'
  if (!access[other]) return null
  const target = other === 'erp' ? ERP_HOME : CRM_HOME
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener"
      className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground sm:gap-1.5 sm:px-2.5"
      title={other === 'erp' ? t('cc_departments.workspace.erpHint', 'Open the ERP in a new tab') : t('cc_departments.workspace.crmHint', 'Open the CRM in a new tab')}
    >
      {other === 'erp' ? t('cc_departments.workspace.openErp', 'ERP') : t('cc_departments.workspace.openCrm', 'CRM')}
      <ExternalLink className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />
    </a>
  )
}

export function CcAppShell({ adminNavApi, rightHeaderSlot, productName, children, workspaceAccess, ...props }: AppShellProps & { workspaceAccess: WorkspaceAccess }) {
  const pathname = usePathname()
  const router = useRouter()
  useFoldSidebarOnFirstVisit(pathname)
  const access = workspaceAccess
  const workspace = workspaceOf(pathname, access)
  const kind = pathKind(pathname)
  const allowed = allowedOn(kind, access)
  const home = homeFor(access)
  const redirectTo = !allowed && home && home !== pathname ? home : null

  React.useEffect(() => {
    if (redirectTo) router.replace(redirectTo)
  }, [redirectTo, router])
  usePlantPwa()
  const tabBar = allowed && !hidesTabBar(pathname)

  return (
    <AppShell
      {...props}
      productName={workspace === 'crm' ? `${productName ?? ''} · CRM` : productName}
      logo={{ src: '/cc-logo.png', alt: 'Creative Carbon Composites', preserveAspectRatio: true }}
      adminNavApi={adminNavApi ? `/api/cc_departments/nav?workspace=${workspace}` : undefined}
      rightHeaderSlot={
        <div className="flex items-center gap-2">
          <WorkspaceLink workspace={workspace} access={access} />
          {rightHeaderSlot}
        </div>
      }
    >
      {allowed ? <div className={tabBar ? 'pb-24 lg:pb-0' : undefined}>{children}</div> : redirectTo ? null : <WorkspaceDenied home={home} />}
      {tabBar ? <MobileTabBar workspace={workspace} /> : null}
    </AppShell>
  )
}

export default CcAppShell
