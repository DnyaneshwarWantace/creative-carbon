/**
 * seedOrders.ts — Demo / client-presentation seed for Creative Carbon Composites
 *
 * Fills every stage with complete, realistic data so you can show the client
 * exactly what each stage looks like on screen.
 *
 * Pipeline:  order → advance → allocation → qc → packing → invoice → dispatch
 *
 *  #   Order No        Status         Current Stage
 * ──  ─────────────  ─────────────  ─────────────────────────────────────────
 *  1  CC/2026-27/001  open           Advance OPEN          (just booked)
 *  2  CC/2026-27/002  open           Allocation OPEN       (advance done)
 *  3  CC/2026-27/003  open           QC OPEN               (allocation done)
 *  4  CC/2026-27/004  confirmed      Packing OPEN          (QC done)
 *  5  CC/2026-27/005  confirmed      Invoice OPEN          (packing done)
 *  6  CC/2026-27/006  confirmed      Dispatch OPEN         (invoice done)
 *  7  CC/2026-27/007  completed      ALL DONE              (fully dispatched)
 *  8  CC/2026-27/008  open           QC OPEN               (advance skipped – credit)
 *  9  CC/2026-27/009  open           Allocation ON HOLD    (stock shortage)
 * 10  CC/2026-27/010  open           QC ON HOLD            (spec not received)
 * 11  CC/2026-27/011  open           Advance OPEN URGENT   (urgent order)
 * 12  CC/2026-27/012  completed      ALL DONE EXPORT       (export, LC)
 * 13  CC/2026-27/013  cancelled      CANCELLED             —
 * 14  CC/2026-27/014  open           Advance OPEN LATE     (delivery past due)
 * 15  CC/2026-27/015  confirmed      Dispatch OPEN #2      (2nd batch ready)
 *
 * Run via:
 *   yarn mercato cc_orders seed-demo \
 *     --tenant <tenantId> --org <organizationId> \
 *     --customer <customerId> --product <productId>
 *
 *   Or with two products for multi-line orders:
 *     --product2 <secondProductId>
 */

import type { EntityManager } from '@mikro-orm/postgresql'
import { CcOrder, CcOrderEvent, CcOrderLine, CcOrderStage } from '../data/entities'
import type { CcSeedScope } from '../../cc_products/lib/seeds'

// ─── date helpers ────────────────────────────────────────────────────────────

function ago(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(9, 0, 0, 0)
  return d
}

function from(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(18, 0, 0, 0)
  return d
}

function ds(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// ─── stage-status constants ──────────────────────────────────────────────────

const DONE    = 'done'
const OPEN    = 'open'
const WAITING = 'waiting'
const ON_HOLD = 'on_hold'
const SKIPPED = 'skipped'

// ─── people ─────────────────────────────────────────────────────────────────

const PEOPLE: Record<string, string> = {
  order:      'Dhairya Shah',
  advance:    'Kavita Patel',
  allocation: 'Raju Mehta',
  qc:         'Anand Joshi',
  packing:    'Suresh Patil',
  invoice:    'Kavita Patel',
  dispatch:   'Suresh Patil',
}

// ─── stage spec type ─────────────────────────────────────────────────────────

type StageSpec = {
  key: string
  status: string
  openedAt: Date | null
  completedAt: Date | null
  completedByName: string | null
  responsibleName: string | null
  data: Record<string, unknown>
  holdReason: string | null
  holdParty: string | null
}

// ─── low-level stage builder ──────────────────────────────────────────────────

function mkStage(
  key: string,
  status: string,
  opts: {
    openedAt?: Date | null
    completedAt?: Date | null
    data?: Record<string, unknown>
    holdReason?: string | null
    holdParty?: string | null
    responsibleName?: string | null
  } = {},
): StageSpec {
  return {
    key,
    status,
    openedAt:        opts.openedAt ?? null,
    completedAt:     opts.completedAt ?? null,
    completedByName: opts.completedAt ? (PEOPLE[key] ?? 'Admin') : null,
    responsibleName: opts.responsibleName ?? (status !== WAITING ? (PEOPLE[key] ?? null) : null),
    data:            opts.data ?? {},
    holdReason:      opts.holdReason ?? null,
    holdParty:       opts.holdParty ?? null,
  }
}

// ─── pipeline shape → 7 StageSpec[] ─────────────────────────────────────────

type PipelineShape = {
  done?:    string[]
  skipped?: string[]
  open?:    string
  hold?:    { key: string; reason: string; party: string }
  allDone?: boolean
  data?:    Record<string, Record<string, unknown>>
  offset?:  number
}

const ALL_STAGE_KEYS = ['order', 'advance', 'allocation', 'qc', 'packing', 'invoice', 'dispatch']

function buildStages(shape: PipelineShape): StageSpec[] {
  const { done = [], skipped = [], open, hold, allDone = false, data = {}, offset = 0 } = shape
  const doneSet    = new Set(done)
  const skippedSet = new Set(skipped)

  return ALL_STAGE_KEYS.map((key, idx) => {
    const base = offset + idx * 2

    if (key === 'order') {
      return mkStage('order', DONE, {
        openedAt:    ago(base + 10),
        completedAt: ago(base + 10),
        data:        data['order'] ?? {},
      })
    }

    if (skippedSet.has(key)) {
      return mkStage(key, SKIPPED, {
        openedAt:    ago(base + 8),
        completedAt: ago(base + 8),
      })
    }

    if (allDone || doneSet.has(key)) {
      return mkStage(key, DONE, {
        openedAt:    ago(base + 8 - idx),
        completedAt: ago(base + 7 - idx),
        data:        data[key] ?? {},
      })
    }

    if (hold && hold.key === key) {
      return mkStage(key, ON_HOLD, {
        openedAt:   ago(base + 3),
        data:       data[key] ?? {},
        holdReason: hold.reason,
        holdParty:  hold.party,
      })
    }

    if (open === key) {
      return mkStage(key, OPEN, {
        openedAt: ago(base + 2),
        data:     data[key] ?? {},
      })
    }

    return mkStage(key, WAITING)
  })
}

// ─── order descriptor ─────────────────────────────────────────────────────────

type OrderDesc = {
  suffix:       string
  customerName: string
  multiLine:    boolean
  qtyKg:        number
  rate:         number
  gst:          number
  orderDate:    Date
  deliveryDate: Date | null
  priority:     'normal' | 'urgent'
  market:       'domestic' | 'export'
  orderType:    'new' | 'repeat' | 'revision'
  status:       'booked' | 'confirmed' | 'completed' | 'cancelled'
  paymentTerms: string | null
  salesManager: string
  note:         string
  stages:       StageSpec[]
}

// ─── 15 demo orders ───────────────────────────────────────────────────────────

function buildDemoOrders(startFrom: number): OrderDesc[] {
  const p = (n: number) => String(startFrom + n - 1).padStart(3, '0')

  return [

    // ── 1. Brand-new order — advance OPEN ────────────────────────────────────
    {
      suffix: p(1), customerName: 'Bakelite Electronics Pvt. Ltd.', multiLine: false,
      qtyKg: 1500, rate: 520, gst: 18,
      orderDate: ago(2), deliveryDate: from(14),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'Just booked — waiting for advance. Customer PO BEL/2026/1143.',
      stages: buildStages({
        open: 'advance', offset: 0,
        data: {
          order: { remarks: 'Standard FR4 3 mm, 1500 kg as per customer PO BEL/2026/1143.' },
        },
      }),
    },

    // ── 2. Advance DONE → allocation OPEN ────────────────────────────────────
    {
      suffix: p(2), customerName: 'Gujarat Electrical Works', multiLine: true,
      qtyKg: 800, rate: 680, gst: 18,
      orderDate: ago(5), deliveryDate: from(10),
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'booked',
      paymentTerms: '30% advance, balance on dispatch', salesManager: 'Dhairya Shah',
      note: 'Advance received — FG store allocating stock now.',
      stages: buildStages({
        done: ['advance'], open: 'allocation', offset: 2,
        data: {
          order:   { remarks: 'G-10 Grade 6 mm, repeat order per PO GEW/OCT/2026/88.' },
          advance: {
            pi_number: 'PI/2026-27/1040', advance_percent: 30, advance_amount: 163200,
            received_on: ds(ago(3)), payment_ref: 'UTR 324178900012',
            lc_number: null, lc_expiry: null,
          },
        },
      }),
    },

    // ── 3. Allocation DONE → QC OPEN ─────────────────────────────────────────
    {
      suffix: p(3), customerName: 'Pune Transformers Ltd.', multiLine: false,
      qtyKg: 400, rate: 980, gst: 18,
      orderDate: ago(8), deliveryDate: from(7),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: 'Credit 30 days', salesManager: 'Dhairya Shah',
      note: 'Credit customer — advance skipped. Stock allocated. QC lab running.',
      stages: buildStages({
        done: ['allocation'], skipped: ['advance'], open: 'qc', offset: 4,
        data: {
          order:      { remarks: 'Phenolic cotton tube 50 mm — as per customer spec sheet.' },
          allocation: {
            allocation_status: 'All from stock', ready_on: ds(ago(5)),
            remarks: 'Lots F/09/10 (200 kg), F/09/11 (200 kg) allocated — oldest first.',
          },
        },
      }),
    },

    // ── 4. QC DONE → packing OPEN ────────────────────────────────────────────
    {
      suffix: p(4), customerName: 'Maharashtrawada Switchgear', multiLine: true,
      qtyKg: 600, rate: 750, gst: 18,
      orderDate: ago(12), deliveryDate: from(3),
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'confirmed',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'QC cleared — despatch team packing now.',
      stages: buildStages({
        done: ['advance', 'allocation', 'qc'], open: 'packing', offset: 6,
        data: {
          order:      { remarks: 'Epoxy glass 1.6 mm, all sizes as per cutting schedule.' },
          advance:    { pi_number: 'PI/2026-27/1043', advance_percent: 50, advance_amount: 225000, received_on: ds(ago(10)), payment_ref: 'UTR 991100044567', lc_number: null, lc_expiry: null },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(8)), remarks: 'Lots F/10/03 (350 kg), F/10/04 (250 kg) ready.' },
          qc:         { standard: 'IS 2036', report_no: 'QC/2026-27/0341', tested_on: ds(ago(4)), remarks: 'Thickness ±0.05 mm. Flexural 280 MPa. Electrical 22 kV/mm. All passed.' },
        },
      }),
    },

    // ── 5. Packing DONE → invoice OPEN ───────────────────────────────────────
    {
      suffix: p(5), customerName: 'Mumbai Marine Equipment Co.', multiLine: false,
      qtyKg: 2200, rate: 600, gst: 18,
      orderDate: ago(15), deliveryDate: from(2),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'confirmed',
      paymentTerms: 'Credit 45 days', salesManager: 'Dhairya Shah',
      note: 'Packing complete — accounts making invoice & e-way bill.',
      stages: buildStages({
        done: ['allocation', 'qc', 'packing'], skipped: ['advance'], open: 'invoice', offset: 8,
        data: {
          order:      { remarks: 'FR4 6 mm — marine application, needs IS 2036 cert.' },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(12)), remarks: '12 lots from FG-STORE, all confirmed FR4 Grade.' },
          qc:         { standard: 'IS 2036', report_no: 'QC/2026-27/0338', tested_on: ds(ago(8)), remarks: 'All 2200 kg cleared. Report QC/0338 issued.' },
          packing:    { pack_type: 'PP wrap + LDP stitch (local)', packages: 12, net_kg: 2198.450, gross_kg: 2210.200, remarks: '12 bundles marked MMEC/2026/FR4-6. LDP stitched and strapped.' },
        },
      }),
    },

    // ── 6. Invoice DONE → dispatch OPEN ──────────────────────────────────────
    {
      suffix: p(6), customerName: 'Rajkot Industrial Plastics', multiLine: false,
      qtyKg: 950, rate: 820, gst: 18,
      orderDate: ago(18), deliveryDate: from(1),
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'confirmed',
      paymentTerms: 'Credit 30 days', salesManager: 'Dhairya Shah',
      note: 'Invoice made — truck booked for tomorrow morning.',
      stages: buildStages({
        done: ['allocation', 'qc', 'packing', 'invoice'], skipped: ['advance'], open: 'dispatch', offset: 10,
        data: {
          order:      { remarks: 'G-11 Grade 10 mm — urgent stock replenishment for RIP.' },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(13)), remarks: 'Single lot F/10/01 (950 kg) covers the full order.' },
          qc:         { standard: 'IS 2036', report_no: 'QC/2026-27/0329', tested_on: ds(ago(10)), remarks: 'Passed. Thickness 10.02 mm avg. Electrical > 20 kV/mm.' },
          packing:    { pack_type: 'PP wrap + LDP stitch (local)', packages: 8, net_kg: 948.800, gross_kg: 956.000, remarks: '8 bundles. Marked RIP/G11-10. Vehicle pre-booked.' },
          invoice:    { invoice_number: 'INV/2026-27/1089', invoice_date: ds(ago(1)), eway_bill_no: 'EWB240000000912', irn: 'IRN8877665544332211AABC', shipping_bill_no: null, remarks: 'E-way bill for 950 kg, value ₹7.79 L. IRN generated.' },
        },
      }),
    },

    // ── 7. COMPLETED domestic order ───────────────────────────────────────────
    {
      suffix: p(7), customerName: 'Bakelite Electronics Pvt. Ltd.', multiLine: true,
      qtyKg: 1200, rate: 480, gst: 18,
      orderDate: ago(30), deliveryDate: ago(10),
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'completed',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'Fully completed and delivered. Balance payment collected.',
      stages: buildStages({
        allDone: true, offset: 20,
        data: {
          order:      { remarks: 'Phenolic paper 2 mm, 1200 kg. Repeat order.' },
          advance:    { pi_number: 'PI/2026-27/0997', advance_percent: 50, advance_amount: 288000, received_on: ds(ago(28)), payment_ref: 'UTR 882200001123', lc_number: null, lc_expiry: null },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(24)), remarks: 'Lots F/08/09, F/08/10, F/08/11 — all from STORE-A.' },
          qc:         { standard: 'IS 2036', report_no: 'QC/2026-27/0301', tested_on: ds(ago(20)), remarks: 'All tests passed. Grade P1 confirmed. Report issued.' },
          packing:    { pack_type: 'PP wrap + LDP stitch (local)', packages: 9, net_kg: 1198.350, gross_kg: 1209.200, remarks: '9 bundles. Marked BEL/2 mm. Stitched and strapped.' },
          invoice:    { invoice_number: 'INV/2026-27/1067', invoice_date: ds(ago(12)), eway_bill_no: 'EWB240000000811', irn: 'IRN9988776655443322XXYY', shipping_bill_no: null, remarks: 'Final balance ₹2.88 L received before dispatch.' },
          dispatch:   { dispatch_date: ds(ago(10)), transporter: 'Shree Transport', vehicle_no: 'GJ 06 CX 4421', lr_number: 'LR/ST/20261017/001', container_no: null, seal_no: null, port: null, delivered_on: ds(ago(8)), dispatch_override: null, remarks: 'Goods delivered on ' + ds(ago(8)) + ' — confirmed by customer.' },
        },
      }),
    },

    // ── 8. Credit customer — advance skipped → QC OPEN ──────────────────────
    {
      suffix: p(8), customerName: 'Vadodara Power Systems', multiLine: false,
      qtyKg: 700, rate: 710, gst: 18,
      orderDate: ago(6), deliveryDate: from(12),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: 'Credit 45 days', salesManager: 'Dhairya Shah',
      note: 'Credit customer — advance skipped, stock allocated, QC next.',
      stages: buildStages({
        done: ['allocation'], skipped: ['advance'], open: 'qc', offset: 3,
        data: {
          order:      { remarks: 'Epoxy glass 3 mm, 700 kg. Credit account VPS/2026/44.' },
          allocation: { allocation_status: 'Part from stock', ready_on: ds(ago(3)), remarks: '500 kg from stock; 200 kg shortfall sent to production plan.' },
        },
      }),
    },

    // ── 9. Allocation ON HOLD ─────────────────────────────────────────────────
    {
      suffix: p(9), customerName: 'Surat Electrical Components', multiLine: false,
      qtyKg: 1800, rate: 580, gst: 18,
      orderDate: ago(9), deliveryDate: from(5),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'HOLD — waiting for production shortfall lot (600 kg). Press F/10/05.',
      stages: buildStages({
        done: ['advance'],
        hold: { key: 'allocation', reason: 'Only 1200 kg in FG store. Need 600 kg more from press run F/10/05. Expected ready 30 Oct 2026.', party: 'Internal' },
        open: 'allocation', offset: 5,
        data: {
          order:      { remarks: 'FR4 1.6 mm, large lot. Delivery critical — transformer factory.' },
          advance:    { pi_number: 'PI/2026-27/1048', advance_percent: 50, advance_amount: 522720, received_on: ds(ago(7)), payment_ref: 'UTR 774400228811', lc_number: null, lc_expiry: null },
          allocation: { allocation_status: 'Part from stock', ready_on: null, remarks: '1200 kg reserved. 600 kg awaiting production. Press F/10/05 in progress.' },
        },
      }),
    },

    // ── 10. QC ON HOLD ────────────────────────────────────────────────────────
    {
      suffix: p(10), customerName: 'Ahmedabad Electronics Hub', multiLine: false,
      qtyKg: 300, rate: 1100, gst: 18,
      orderDate: ago(14), deliveryDate: from(4),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: 'Credit 30 days', salesManager: 'Dhairya Shah',
      note: 'HOLD — customer test specification not received. QC cannot start.',
      stages: buildStages({
        done: ['allocation'], skipped: ['advance'],
        hold: { key: 'qc', reason: 'Customer test specification (IEC 60893 variant) not received. Last follow-up: 25 Oct 2026.', party: 'Customer side' },
        open: 'qc', offset: 7,
        data: {
          order:      { remarks: 'Phenolic cotton tube 80 mm — special customer spec required.' },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(10)), remarks: 'Stock allocated and kept in HOLD bay. Lot F/09/18 (300 kg).' },
          qc:         { standard: 'IEC', report_no: null, tested_on: null, remarks: 'Waiting for customer test spec via email. Follow-up sent 25 Oct 2026.' },
        },
      }),
    },

    // ── 11. URGENT order ──────────────────────────────────────────────────────
    {
      suffix: p(11), customerName: 'Pune Transformers Ltd.', multiLine: false,
      qtyKg: 500, rate: 760, gst: 18,
      orderDate: ago(1), deliveryDate: from(4),
      priority: 'urgent', market: 'domestic', orderType: 'new', status: 'booked',
      paymentTerms: '100% advance', salesManager: 'Dhairya Shah',
      note: 'URGENT — customer needs fast delivery for transformer assembly line.',
      stages: buildStages({
        open: 'advance', offset: 0,
        data: { order: { remarks: 'URGENT — Epoxy glass 6 mm, 500 kg. Need in 4 days.' } },
      }),
    },

    // ── 12. COMPLETED export order ────────────────────────────────────────────
    {
      suffix: p(12), customerName: 'Al Khaleej Electrical (UAE)', multiLine: false,
      qtyKg: 3000, rate: 640, gst: 0,
      orderDate: ago(45), deliveryDate: ago(15),
      priority: 'normal', market: 'export', orderType: 'new', status: 'completed',
      paymentTerms: 'LC at sight', salesManager: 'Dhairya Shah',
      note: 'Export to UAE — fully completed. Container at Mundra.',
      stages: buildStages({
        allDone: true, offset: 35,
        data: {
          order:      { remarks: 'FR4 3 mm × 3000 kg, export to UAE. LC ADCB/2026/00312.' },
          advance:    { pi_number: 'PI/2026-27/0988', advance_percent: 0, advance_amount: 0, received_on: ds(ago(42)), payment_ref: null, lc_number: 'LC/ADCB/2026/00312', lc_expiry: ds(from(5)) },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(38)), remarks: '24 lots selected oldest-first, all Grade FR4 confirmed.' },
          qc:         { standard: 'IEC', report_no: 'QC/2026-27/0278', tested_on: ds(ago(32)), remarks: 'IEC 60893 — all 3000 kg cleared. COA and test report issued.' },
          packing:    { pack_type: 'Pallet (export)', packages: 24, net_kg: 2998.800, gross_kg: 3050.000, remarks: '24 pallets, heat-treated, ISPM-15 marked. Stretch-wrapped.' },
          invoice:    { invoice_number: 'INV/2026-27/1041', invoice_date: ds(ago(18)), eway_bill_no: null, irn: null, shipping_bill_no: 'SB/2026/MUNDRA/9901', remarks: 'Commercial invoice USD 11,520. Shipping bill filed. BL issued.' },
          dispatch:   { dispatch_date: ds(ago(16)), transporter: 'Mundra Container Lines', vehicle_no: null, lr_number: null, container_no: 'MSKU1234567', seal_no: 'SEAL998877', port: 'Mundra', delivered_on: null, dispatch_override: null, remarks: 'FCL stuffed at factory. Customs cleared. ETA Dubai 12 Nov.' },
        },
      }),
    },

    // ── 13. CANCELLED ─────────────────────────────────────────────────────────
    {
      suffix: p(13), customerName: 'Delhi Insulation Products', multiLine: false,
      qtyKg: 900, rate: 440, gst: 18,
      orderDate: ago(20), deliveryDate: from(0),
      priority: 'normal', market: 'domestic', orderType: 'new', status: 'cancelled',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'Cancelled — customer found a cheaper local source. No advance collected.',
      stages: buildStages({
        open: 'advance', offset: 15,
        data: { order: { remarks: 'Phenolic paper 1.5 mm — cancelled post-booking. No PI issued.' } },
      }),
    },

    // ── 14. LATE — delivery past due, advance still open ─────────────────────
    {
      suffix: p(14), customerName: 'Gujarat Electrical Works', multiLine: true,
      qtyKg: 1100, rate: 640, gst: 18,
      orderDate: ago(22), deliveryDate: ago(3),     // past due → LATE badge
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'booked',
      paymentTerms: 'Credit 30 days', salesManager: 'Dhairya Shah',
      note: 'LATE — delivery date passed. Advance still open. Customer escalating.',
      stages: buildStages({
        open: 'advance', offset: 1,
        data: { order: { remarks: 'G-10 Grade 3 mm. Repeat. Delivery overdue — escalated to director.' } },
      }),
    },

    // ── 15. Second dispatch-ready batch ──────────────────────────────────────
    {
      suffix: p(15), customerName: 'Maharashtrawada Switchgear', multiLine: false,
      qtyKg: 750, rate: 740, gst: 18,
      orderDate: ago(25), deliveryDate: ago(2),
      priority: 'normal', market: 'domestic', orderType: 'repeat', status: 'confirmed',
      paymentTerms: '50% advance, 50% before dispatch', salesManager: 'Dhairya Shah',
      note: 'Invoice done — loading scheduled 10 AM today. Second batch for MSW.',
      stages: buildStages({
        done: ['advance', 'allocation', 'qc', 'packing', 'invoice'], open: 'dispatch', offset: 18,
        data: {
          order:      { remarks: 'Epoxy glass 1.6 mm — second batch for MS Switchgear.' },
          advance:    { pi_number: 'PI/2026-27/1019', advance_percent: 50, advance_amount: 277500, received_on: ds(ago(23)), payment_ref: 'UTR 112233445566', lc_number: null, lc_expiry: null },
          allocation: { allocation_status: 'All from stock', ready_on: ds(ago(18)), remarks: 'Lots F/09/21 (450 kg), F/09/22 (300 kg) allocated.' },
          qc:         { standard: 'IS 2036', report_no: 'QC/2026-27/0355', tested_on: ds(ago(14)), remarks: 'Thickness 1.61 mm avg. Flexural and electrical passed.' },
          packing:    { pack_type: 'PP wrap + LDP stitch (local)', packages: 6, net_kg: 748.600, gross_kg: 754.000, remarks: '6 bundles. Marked MSW/EP-1.6. Ready by gate.' },
          invoice:    { invoice_number: 'INV/2026-27/1101', invoice_date: ds(ago(3)), eway_bill_no: 'EWB240000001101', irn: 'IRN11223344556677PPQQ', shipping_bill_no: null, remarks: 'Balance ₹2.78 L to be collected on delivery.' },
          dispatch:   { dispatch_date: ds(ago(0)), transporter: 'Om Carriers', vehicle_no: 'GJ 07 AB 1234', lr_number: null, container_no: null, seal_no: null, port: null, delivered_on: null, dispatch_override: null, remarks: 'Loading in progress. LR to be filled once truck leaves.' },
        },
      }),
    },
  ]
}

// ─── context type ─────────────────────────────────────────────────────────────

export type DemoSeedContext = CcSeedScope & {
  /** Customer record that must already exist in the database */
  customerId: string
  /** Primary product ID (must already exist) */
  productId: string
  /** Optional second product ID for multi-line orders */
  productId2?: string
  /** Order-number prefix, e.g. "CC/2026-27". Default: "CC/2026-27" */
  seriesPrefix?: string
  /** Starting sequence number. Default: 1 */
  startFrom?: number
}

// ─── main seed function ───────────────────────────────────────────────────────

export async function seedDemoOrders(em: EntityManager, ctx: DemoSeedContext): Promise<void> {
  const prefix    = ctx.seriesPrefix ?? 'CC/2026-27'
  const startFrom = ctx.startFrom    ?? 1
  const scope     = { organizationId: ctx.organizationId, tenantId: ctx.tenantId }

  console.log(`\nSeeding ${prefix} demo orders for org ${ctx.organizationId} …`)

  // ── wipe existing demo orders (idempotent re-run) ─────────────────────────
  const existing = await em.find(CcOrder, { ...scope, orderNo: { $like: `${prefix}/%` } })
  if (existing.length) {
    console.log(`  Removing ${existing.length} existing demo orders …`)
    for (const order of existing) {
      const all = await Promise.all([
        em.find(CcOrderStage, { ...scope, orderId: order.id }),
        em.find(CcOrderLine,  { ...scope, orderId: order.id }),
        em.find(CcOrderEvent, { ...scope, orderId: order.id }),
      ])
      for (const r of all.flat()) em.remove(r)
      em.remove(order)
    }
    await em.flush()
  }

  const descs = buildDemoOrders(startFrom)

  for (const desc of descs) {
    const orderNo = `${prefix}/${desc.suffix}`

    // ── order header ─────────────────────────────────────────────────────────
    const order = em.create(CcOrder, {
      ...scope,
      orderNo,
      orderDate:     ds(desc.orderDate),
      deliveryDate:  desc.deliveryDate ? ds(desc.deliveryDate) : null,
      customerId:    ctx.customerId,
      orderType:     desc.orderType,
      status:        desc.status,
      priority:      desc.priority,
      market:        desc.market,
      currency:      desc.market === 'export' ? 'USD' : 'INR',
      paymentTerms:  desc.paymentTerms,
      salesManager:  desc.salesManager,
      createdByName: 'Admin (Demo Seed)',
      createdAt:     desc.orderDate,
      updatedAt:     new Date(),
    })
    em.persist(order)
    await em.flush()

    // ── line 1 ───────────────────────────────────────────────────────────────
    em.persist(em.create(CcOrderLine, {
      ...scope,
      orderId:         order.id,
      position:        1,
      productId:       ctx.productId,
      quantity:        String(desc.qtyKg),
      rate:            String(desc.rate),
      gstPercent:      String(desc.gst),
      discountPercent: '0',
    }))

    // ── line 2 (optional) ────────────────────────────────────────────────────
    if (desc.multiLine && ctx.productId2) {
      em.persist(em.create(CcOrderLine, {
        ...scope,
        orderId:         order.id,
        position:        2,
        productId:       ctx.productId2,
        quantity:        String(Math.round(desc.qtyKg * 0.25)),
        rate:            String(Math.round(desc.rate * 0.85)),
        gstPercent:      String(desc.gst),
        discountPercent: '0',
      }))
    }

    // ── stages ───────────────────────────────────────────────────────────────
    for (const spec of desc.stages) {
      em.persist(em.create(CcOrderStage, {
        ...scope,
        orderId:         order.id,
        stageKey:        spec.key,
        status:          spec.status,
        responsibleName: spec.responsibleName,
        data:            spec.data,
        holdReason:      spec.holdReason,
        holdParty:       spec.holdParty,
        openedAt:        spec.openedAt,
        completedAt:     spec.completedAt,
        completedByName: spec.completedByName,
        createdAt:       desc.orderDate,
        updatedAt:       new Date(),
      }))
    }

    // ── creation event ────────────────────────────────────────────────────────
    em.persist(em.create(CcOrderEvent, {
      ...scope,
      orderId:   order.id,
      stageKey:  'order',
      action:    'created',
      note:      desc.note,
      byName:    'Admin (Demo Seed)',
      createdAt: desc.orderDate,
    }))

    await em.flush()

    // ── console summary ───────────────────────────────────────────────────────
    const cur = desc.stages.find((s) => s.status === OPEN || s.status === ON_HOLD)
    const badge =
      desc.status === 'completed' ? '✅ DONE' :
      desc.status === 'cancelled' ? '✕  CANCELLED' :
      cur ? `▶  ${cur.key.toUpperCase()}${cur.status === ON_HOLD ? ' [HOLD]' : ''}` : '?'
    console.log(`  ${orderNo}  ${desc.customerName.padEnd(35)}  ${badge}`)
  }

  console.log(`\n✓ ${descs.length} demo orders seeded successfully.\n`)
}
