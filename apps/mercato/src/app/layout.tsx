import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import '@/lib/i18n/register-dictionary-loader'
import { AppProviders } from '@/components/AppProviders'

import { detectLocale, loadDictionary } from '@open-mercato/shared/lib/i18n/server'
import { resolveForcedLocale } from '@open-mercato/shared/lib/i18n/locale'

const ccSans = Archivo({ subsets: ['latin'], variable: '--cc-font-sans', display: 'swap' })
const ccMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--cc-font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Creative Carbon Composites ERP', template: '%s · Creative Carbon' },
  description: 'Plant, stock, orders and despatch for Creative Carbon Composites',
  manifest: '/cc-manifest.webmanifest',
  applicationName: 'Creative Carbon',
  appleWebApp: { capable: true, title: 'Creative Carbon', statusBarStyle: 'default' },
  icons: { icon: '/cc-icon-192.png', apple: '/cc-icon-192.png' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
}

import { THEME_INIT_SCRIPT } from '@open-mercato/ui/theme/theme-init-script'

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await detectLocale()
  const dict = await loadDictionary(locale)
  const localeLocked = resolveForcedLocale(process.env) !== null
  const demoModeEnabled = process.env.DEMO_MODE !== 'false'
  const noticeBarsEnabled = process.env.OM_INTEGRATION_TEST !== 'true'
  return (
    <html lang={locale} className={`${ccSans.variable} ${ccMono.variable}`} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground" suppressHydrationWarning data-gramm="false">
        <script id="om-theme-init" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppProviders locale={locale} dict={dict} localeLocked={localeLocked} demoModeEnabled={demoModeEnabled} noticeBarsEnabled={noticeBarsEnabled}>
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
