"use client"

import * as React from 'react'
import { useListOptions } from './useListOptions'
import { paymentTermLabel, paymentTermOptions } from '../lib/paymentTerms'

export function usePaymentTerms(current?: string | null): Array<{ value: string; label: string }> {
  const labels = useListOptions('payment_terms')
  return React.useMemo(() => {
    const options = paymentTermOptions(labels)
    if (current && !options.some((option) => option.value === current)) options.push({ value: current, label: paymentTermLabel(current) })
    return options
  }, [labels, current])
}
