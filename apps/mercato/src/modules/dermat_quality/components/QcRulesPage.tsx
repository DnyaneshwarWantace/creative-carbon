"use client"

import * as React from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { OPERATION_LABEL } from './shared'

type Rule = {
  id: string
  code: string
  title: string
  operation: string
  productId: string | null
  productTitle: string | null
  productCode: string | null
  requiresChemical: boolean
  requiresMicro: boolean
  isActive: boolean
  parameters: Array<{ key: string; test: string }>
}

export function QcRulesPage() {
  const t = useT()
  const [rules, setRules] = React.useState<Rule[] | null>(null)

  React.useEffect(() => {
    apiCall<{ items?: Rule[] }>('/api/dermat_quality/rules', undefined, { fallback: { items: [] } }).then((call) => setRules(call.result?.items ?? []))
  }, [])

  if (!rules) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_quality.rules.loading', 'Loading QC rules…')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
            <div>
              <h1 className="text-xl font-bold">{t('dermat_quality.nav.rules', 'QC rules')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('dermat_quality.rules.hint', 'Each test point has a default rule. Add a rule for one product when it needs its own parameters or specifications.')}
              </p>
            </div>
            <Button asChild>
              <Link href="/backend/qc/rules/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('dermat_quality.rules.new', 'Rule for a product')}
              </Link>
            </Button>
          </div>
          {Object.entries(OPERATION_LABEL).map(([operation, label]) => {
            const list = rules.filter((rule) => rule.operation === operation)
            return (
              <Card key={operation} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="text-sm font-bold">{label}</CardTitle>
                  <CardDescription className="text-xs">{t('dermat_quality.rules.count', '{count} rules', { count: list.length })}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="divide-y text-sm">
                    {list.map((rule) => (
                      <li key={rule.id}>
                        <Link href={`/backend/qc/rules/${rule.id}`} className={cn('grid grid-cols-1 gap-2 px-4 py-3 hover:bg-muted/30 md:grid-cols-12 md:items-center', !rule.isActive && 'opacity-60')}>
                          <span className="font-mono text-xs md:col-span-2">{rule.code}</span>
                          <span className="md:col-span-5">
                            <span className="font-medium">{rule.title}</span>
                            <span className="block text-xs text-muted-foreground">
                              {rule.productId ? `${rule.productCode ? `${rule.productCode} · ` : ''}${rule.productTitle}` : t('dermat_quality.rules.default', 'Default for every product')}
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1.5 md:col-span-3">
                            <StatusBadge variant={rule.requiresChemical ? 'info' : 'neutral'}>{rule.requiresChemical ? 'Chemical' : 'No chemical'}</StatusBadge>
                            <StatusBadge variant={rule.requiresMicro ? 'info' : 'neutral'}>{rule.requiresMicro ? 'Micro' : 'No micro'}</StatusBadge>
                          </span>
                          <span className="flex items-center justify-between gap-2 text-xs md:col-span-2 md:justify-end">
                            <span className="text-muted-foreground">
                              {t('dermat_quality.rules.params', '{count} parameters', { count: rule.parameters.length })}
                            </span>
                            <StatusBadge variant={rule.isActive ? 'success' : 'neutral'}>{rule.isActive ? t('dermat_quality.rules.on', 'On') : t('dermat_quality.rules.off', 'Off')}</StatusBadge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </PageBody>
    </Page>
  )
}

export default QcRulesPage
