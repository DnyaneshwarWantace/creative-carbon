const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function belowHundred(value: number): string {
  if (value < 20) return ONES[value]
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? ` ${ONES[value % 10]}` : ''}`
}

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100)
  const rest = value % 100
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ')
}

function wholeWords(value: number): string {
  if (value === 0) return 'Zero'
  const crore = Math.floor(value / 10000000)
  const lakh = Math.floor((value % 10000000) / 100000)
  const thousand = Math.floor((value % 100000) / 1000)
  const rest = value % 1000
  return [
    crore ? `${wholeWords(crore)} Crore` : '',
    lakh ? `${belowHundred(lakh)} Lakh` : '',
    thousand ? `${belowHundred(thousand)} Thousand` : '',
    rest ? belowThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function rupeesInWords(amount: number): string {
  const safe = Math.max(0, Math.round(amount * 100) / 100)
  const rupees = Math.floor(safe)
  const paise = Math.round((safe - rupees) * 100)
  return `Rupees ${wholeWords(rupees)}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`
}

function internationalWords(value: number): string {
  if (value === 0) return 'Zero'
  const groups: Array<[number, string]> = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ]
  const parts: string[] = []
  let rest = value
  for (const [size, name] of groups) {
    const count = Math.floor(rest / size)
    if (count) parts.push(`${belowThousand(count)} ${name}`)
    rest %= size
  }
  if (rest) parts.push(belowThousand(rest))
  return parts.join(' ')
}

const CURRENCY_WORDS: Record<string, [string, string]> = {
  USD: ['US Dollars', 'Cents'],
  EUR: ['Euros', 'Cents'],
  GBP: ['Pounds Sterling', 'Pence'],
  AED: ['UAE Dirhams', 'Fils'],
  SAR: ['Saudi Riyals', 'Halalas'],
  AUD: ['Australian Dollars', 'Cents'],
  SGD: ['Singapore Dollars', 'Cents'],
  CNY: ['Yuan', 'Fen'],
  JPY: ['Yen', 'Sen'],
}

export function amountInWords(amount: number, currency: string): string {
  if (!currency || currency.toUpperCase() === 'INR') return rupeesInWords(amount)
  const [major, minor] = CURRENCY_WORDS[currency.toUpperCase()] ?? [currency.toUpperCase(), 'Cents']
  const safe = Math.max(0, Math.round(amount * 100) / 100)
  const whole = Math.floor(safe)
  const fraction = Math.round((safe - whole) * 100)
  return `${major} ${internationalWords(whole)}${fraction ? ` and ${minor} ${belowHundred(fraction)}` : ''} Only`
}
