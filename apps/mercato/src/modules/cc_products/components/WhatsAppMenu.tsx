"use client"

import * as React from 'react'
import { ChevronDown, MessageCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { whatsappLink, whatsappNumber } from '../lib/whatsapp'

export type WhatsAppMessage = { key: string; label: string; hint?: string; text: string }

type Props = {
  phone: string | null | undefined
  recipient: string
  messages: WhatsAppMessage[]
  size?: 'sm' | 'default'
}

export function WhatsAppMenu({ phone, recipient, messages, size = 'sm' }: Props) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const number = whatsappNumber(phone)
  if (!messages.length) return null
  const send = (message: WhatsAppMessage) => {
    window.open(whatsappLink(phone, message.text), '_blank', 'noopener,noreferrer')
    setOpen(false)
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size={size}>
          <MessageCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('cc_products.whatsapp.button', 'WhatsApp')}
          <ChevronDown className="ml-1 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">{t('cc_products.whatsapp.to', 'Message {name}', { name: recipient })}</p>
          <p className="text-xs text-muted-foreground">
            {number
              ? t('cc_products.whatsapp.number', 'Opens WhatsApp to +{number} with the text filled in. You press send.', { number })
              : t('cc_products.whatsapp.noNumber', 'No phone number saved, so WhatsApp will ask you to pick the contact.')}
          </p>
        </div>
        <ul className="py-1">
          {messages.map((message) => (
            <li key={message.key}>
              <button
                type="button"
                onClick={() => send(message)}
                className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <span className="text-sm font-medium">{message.label}</span>
                <span className="line-clamp-2 text-xs text-muted-foreground">{message.hint ?? message.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

export default WhatsAppMenu
