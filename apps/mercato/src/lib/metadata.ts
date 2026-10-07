import type { Metadata } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export async function resolveLocalizedAppMetadata(): Promise<Metadata> {
  const { t } = await resolveTranslations()
  return {
    title: t('app.metadata.title', 'Creative Carbon Composites'),
    description: t(
      'app.metadata.description',
      'Plant, stock, orders and despatch for Creative Carbon Composites',
    ),
  }
}

export async function resolveLocalizedTitleMetadata(input: {
  title?: string | null
  titleKey?: string | null
  fallback?: string
}): Promise<Metadata> {
  const { t } = await resolveTranslations()
  const fallbackTitle = input.title || input.fallback || 'Creative Carbon Composites'
  return {
    title: input.titleKey ? t(input.titleKey, fallbackTitle) : fallbackTitle,
  }
}
