import { numberClashes } from '../tallyPush'
import type { TallyVoucher } from '../tally'
import type { TallyVoucherRow } from '../tallyClient'

const voucher = (number: string, party = 'Sample Traders'): TallyVoucher => ({ type: 'Sales', date: '2026-10-05', number, reference: null, party, narration: '', entries: [], recordId: null })
const row = (number: string, remoteId: string | null, extra: Partial<TallyVoucherRow> = {}): TallyVoucherRow => ({ date: '2026-10-05', type: 'Sales', number, party: 'Other Party', reference: null, amount: 1000, remoteId, cancelled: false, ...extra })

describe('Tally number clash', () => {
  it('flags a number already used in Tally by an entry that is not ours', () => {
    const clashes = numberClashes([voucher('652'), voucher('653')], [row('652', null), row('700', null)])
    expect(clashes.map((clash) => clash.number)).toEqual(['652'])
    expect(clashes[0].tallyParty).toBe('Other Party')
  })

  it('does not flag our own earlier entry, a cancelled one, or another voucher type', () => {
    const clashes = numberClashes([voucher('652'), voucher('653'), voucher('654')], [row('652', 'CCCPL-Sales-652'), row('653', null, { cancelled: true }), row('654', null, { type: 'Receipt' })])
    expect(clashes).toEqual([])
  })
})
