"use client"

import * as React from 'react'
import { Input } from '@open-mercato/ui/primitives/input'
import { useListOptions } from './useListOptions'

type Props = Omit<React.ComponentProps<typeof Input>, 'list'> & { listKey: string }

export function SuggestInput({ listKey, id, ...rest }: Props) {
  const options = useListOptions(listKey)
  const generated = React.useId()
  const listId = `${id ?? generated}-suggestions`
  return (
    <>
      <Input id={id} list={options.length ? listId : undefined} autoComplete="off" {...rest} />
      {options.length ? (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

export default SuggestInput
