"use client"

import * as React from 'react'
import { AtSign, MessageSquare, Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { announceActivity } from './Timeline'

type Person = { id: string; name: string }

let peopleCache: Promise<Person[]> | null = null

function loadPeople(): Promise<Person[]> {
  if (!peopleCache) {
    peopleCache = apiCall<{ items?: Person[] }>('/api/cc_audit/people', undefined, { fallback: { items: [] } }).then((call) => {
      if (!call.ok) peopleCache = null
      return call.result?.items ?? []
    })
  }
  return peopleCache
}

function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const match = /(^|\s)@([^\s@]{0,30})$/.exec(before)
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2].toLowerCase() }
}

export function Comments({ type, id }: { type: string; id: string }) {
  const t = useT()
  const [text, setText] = React.useState('')
  const [people, setPeople] = React.useState<Person[]>([])
  const [mentions, setMentions] = React.useState<Person[]>([])
  const [query, setQuery] = React.useState<{ start: number; query: string } | null>(null)
  const [active, setActive] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const box = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    void loadPeople().then(setPeople)
  }, [])

  const matches = React.useMemo(() => (query ? people.filter((person) => person.name.toLowerCase().includes(query.query)).slice(0, 6) : []), [people, query])

  const pick = (person: Person) => {
    if (!query) return
    const caret = box.current?.selectionStart ?? text.length
    const next = `${text.slice(0, query.start)}@${person.name} ${text.slice(caret)}`
    setText(next)
    setMentions((prev) => (prev.some((entry) => entry.id === person.id) ? prev : [...prev, person]))
    setQuery(null)
    requestAnimationFrame(() => {
      const position = query.start + person.name.length + 2
      box.current?.focus()
      box.current?.setSelectionRange(position, position)
    })
  }

  const send = async () => {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const used = mentions.filter((person) => body.includes(`@${person.name}`))
    const call = await apiCall<{ ok?: boolean; notified?: string[]; error?: string }>('/api/cc_audit/comments', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, id, text: body, mentions: used.map((person) => person.id) }),
    })
    setBusy(false)
    if (!call.ok) {
      flash(call.result?.error ?? t('cc_ui.comments.error', 'Could not save the comment.'), 'error')
      return
    }
    setText('')
    setMentions([])
    const notified = call.result?.notified?.length ?? 0
    flash(notified ? t('cc_ui.comments.sentNotified', 'Comment added; {count} person(s) notified', { count: notified }) : t('cc_ui.comments.sent', 'Comment added'), 'success')
    announceActivity(type, id)
  }

  return (
    <section className="space-y-2 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t('cc_ui.comments.title', 'Comment')}
      </h2>
      <div className="relative">
        <Textarea
          ref={box}
          rows={2}
          value={text}
          maxLength={2000}
          disabled={busy}
          placeholder={t('cc_ui.comments.hint', 'Write a note for the team. Type @ to tell someone.')}
          onChange={(event) => {
            setText(event.target.value)
            setQuery(mentionQuery(event.target.value, event.target.selectionStart ?? event.target.value.length))
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (matches.length) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((current) => (current + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                pick(matches[active])
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setQuery(null)
                return
              }
            }
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void send()
            }
          }}
          onBlur={() => setTimeout(() => setQuery(null), 150)}
        />
        {matches.length ? (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border bg-popover p-1 shadow-md">
            {matches.map((person, index) => (
              <li key={person.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={cn('flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm', index === active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted')}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    pick(person)
                  }}
                >
                  <AtSign className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {person.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('cc_ui.comments.keys', 'Ctrl/⌘ + Enter to send')}</p>
        <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          {t('cc_ui.comments.send', 'Send')}
        </Button>
      </div>
    </section>
  )
}

export default Comments
