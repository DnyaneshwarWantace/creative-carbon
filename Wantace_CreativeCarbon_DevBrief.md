# Creative Carbon Composites — Manufacturing ERP + CRM
## Technical Brief for the Development Team

**Client:** Creative Carbon Composites Pvt. Ltd. (CCCPL), Kanera, Dist. Kheda, Gujarat — industrial laminates, tubes, rods and compression-moulded components
**Contact:** Mr. Dhairya Shah, Director · GSTIN 24AAICC5600P1ZJ
**Engagement:** WT/2026-27/CCC-01 · ₹4,00,000 · prototype demo mid-November, go-live before year-end
**Source material:** on-site audit 7 Oct 2026 (full-day walkthrough, plant + office), 12 photographs of live registers, discovery calls 18 Sep and 6 Oct 2026
**Version:** 1.0 · 7 Oct 2026 · *draft for internal review; the client-facing spec is the companion document*

---

## 0. Read this first

Four things drive every design decision here. When a trade-off comes up, resolve it in favour of these.

1. **The screen must look like the register it replaces.** The client said it in plain terms: *"our focus is that initially we start in such a way that it looks like a register, and the entry is only as much as they would do on the register."* Every form in §3 is photographed and transcribed. Match the field order, match the column names, match the vocabulary. Do not improve the layout.

2. **80% of the value at 20% of the complexity.** His words. There are fields on their paper forms — press top/bottom temperature, curing time, trimming weights — that are *printed on the form and left blank in practice*. Build them as optional, default them off, and let him switch them on later. Shipping a form that demands more than the register did is how this fails.

3. **A dedicated data-entry operator will run the system for the first 3–4 months.** Not the shop-floor staff. This inverts the usual priority: **bulk CSV/Excel upload is a P1 feature, not a nice-to-have** (§6). One person will sit with a stack of registers at end of day. Design for that person first, the floor second.

4. **The plant runs on a mobile hotspot, 15 km from the nearest town.** Minimal payloads, aggressive caching, no heavy assets, and every entry screen must tolerate a dropped connection without losing what was typed. Tablets on the floor are **deferred to phase 2** — assume phones and one office desktop.

Non-goals are in §11. They are contractual.

---

## 1. The business, in one pass

Integrated composites manufacturer. They synthesise their own phenolic resin, impregnate paper and cloth with it, then compression-mould the result into laminates, tubes, rods and shaped components. **80 tonnes a month** out the door; **over 100 tonnes** of finished goods held in stock, deliberately, about a month ahead of demand.

```
CHEMICALS                    REINFORCEMENT
phenol · formaldehyde        paper · cloth (by GSM)
methanol · ammonia           cotton fibre chips ("chindi")
cardinol · caustic · oxalic          │
     │                               │
     ▼                               │
┌─────────────────┐                  │
│ 1. RESIN PLANT  │                  │
│   reactors      │                  │
│   batch ≈ 6 T   │                  │
│  CCCPL/DDMMYY/NN│                  │
└────────┬────────┘                  │
         │  resin ────────────────┐  │
         ▼                        ▼  ▼
                        ┌────────────────────┐
                        │ 2. IMPREGNATION    │   3 dryer lines
                        │    (coating)       │   + 1 mixer oven
                        │  RC% · VC% logged  │
                        └─────────┬──────────┘
                                  │
                         B-STAGE / PRE-PREG
                      ⏱ 5–7 days, max 10
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
         ┌────────────────────┐        SOLD AS B-STAGE
         │ 3. COMPRESSION     │        (priced per kg,
         │    MOULDING        │         low volume today,
         │  25 presses (20-21 │         growing)
         │  live) · ~3000     │
         │  moulds & dies     │
         │  F/NN/MM/YYYY      │
         └─────────┬──────────┘
                   ▼
        CUTTING · TRIMMING (7–8% loss sheets, 5% moulding)
                   ▼
        LAB — mechanical + electrical → QA report
                   ▼
        FINISHED GOODS (>100 T held)  ◀── bought-in goods (trading)
                   ▼
        PACK — pallets (export) / PP wrap + LDP stitch (local)
                   ▼
        DESPATCH — 30 containers/mo total, 6–7 from this plant
```

### The six structural quirks

These are the domain. They are why no packaged product fits.

| # | Quirk | Consequence |
|---|---|---|
| **Q1** | **Everything is weight.** Sheets, tubes, rods, offcuts — all transacted in kg. Only moulded components are counted in units. | `base_uom` is KG across the board. Piece counts are a *secondary* attribute on moulded items only. Never derive weight from pieces. |
| **Q2** | **Raw material is not order-linked.** They buy in container quantities, always overstocked, independent of the order book. *"We always have running orders, so we always keep stock inventory."* | No MRP. No requisition-from-order. Purchase is its own cycle driven by reorder level, not by demand explosion. Do not build a planning engine that assumes order→material. |
| **Q3** | **One press batch produces several thicknesses at once.** Batch `F/03/10/2026` yielded 1.5 mm × 10, 10 mm × 6, 15 mm × 6, 25 mm × 2 — 24 daylights, one batch number, one total weight (996.300 kg). | A production batch is a **header with N daylight lines**, each carrying its own thickness, grade and loading weight. Output is multi-SKU from one batch. This is the single most important modelling decision in the build. |
| **Q4** | **B-stage is both WIP and a saleable product.** Same physical material, two destinies, decided late — and it has a 5–7 day clock running. | Pre-preg lots sit in one pool with a `is_saleable` flag, not two pools. A lot can be consumed into a press batch *or* despatched to a customer. Cost must carry forward correctly on both paths. |
| **Q5** | **A failed resin batch is total loss.** Once a year, ~₹15–20 lakh. The reactor jams and must be physically uprooted. No rework, no downgrade, no salvage. | The batch failure path is `SCRAP` only. Do not build rework or blending flows for resin — they do not exist. Capture the loss against the batch so the yield history stays honest. |
| **Q6** | **Finished goods can enter without production.** They buy finished product from outside and resell it under the same company. | Finished-goods inward must accept a direct entry with no parent batch. Same for raw material sold on directly. Build both as first-class `ADJUSTMENT`-style documents, not hacks. |

---

## 2. Recommended stack

Recommendation, not mandate — flag disagreement before week 2.

| Layer | Recommendation | Why |
|---|---|---|
| Database | **PostgreSQL 15+** | Real transactions, correct decimals. All weights and money `NUMERIC`, never float. |
| Backend | Node/TypeScript (NestJS) or Laravel | Team's choice. Clean transaction support is the requirement. |
| Frontend | React + TanStack Table, or server-rendered with a strong grid | Register-shaped dense grids are the whole UI. Optimise for that, not for cards. |
| Delivery | **Installable PWA**, mobile-native feel | Contractual. No native app (§11). Must feel like an app on a phone, not a shrunk website. |
| Offline | Service worker + local queue on entry screens | §9. The hotspot drops. Non-negotiable. |
| Hosting | Client's own cloud account, or a plant-local server | **Open decision §12.1** — depends on the signal survey. |
| PDF | Server-side (Puppeteer / wkhtmltopdf) | Invoices, challans, COAs must render identically. |

**Numeric types — non-negotiable:**

- Weights: `NUMERIC(12,3)` kg — the despatch register records to three decimals (`43.450`, `214.450`).
- Percentages (RC, VC, solid content): `NUMERIC(5,2)`.
- Temperatures: `NUMERIC(5,1)` °C.
- Piece counts: `INTEGER`, moulded items only.
- Money: `NUMERIC(14,2)`.
- Thickness: `NUMERIC(6,2)` mm — values seen from 1.0 to 60 mm.

---

## 3. The registers — transcribed

**This section is the specification.** Every form below was photographed on 7 Oct. Field names are theirs, spelling included. Build the screens to match.

### 3.1 Resin batch report — `CCCPL/F/QC/03`

Printed form, one per batch. Header: company, form code, issue date, rev no, rev date, **vessel** (`CCCPL-VES-2`), **date**.

| Field | Type | Notes |
|---|---|---|
| Batch No. | text | `CCCPL/110726/06` — prefix / DDMMYY / sequence |
| Grade | enum | **PFC · PFA · PFAC · E-GLASS** (tick one) |
| Materials — Phenol | kg | `877.5` |
| Materials — Formaldehyde | kg | `1236` |
| Materials — Cardinol | kg | `800` |
| Materials — Liquid Ammonia | kg | `58` |
| Materials — Caustic Soda Flakes | kg | often blank |
| Materials — Methanol | kg | often blank |
| Materials — Oxalic Acid | kg | often blank |
| Check pH, heat to 45–50 °C | step | checkbox |
| Stirring 15 min | step | checkbox |
| Cool to 35 °C, change LiqNH3/caustic | step | checkbox |
| Stirring 15 min | step | checkbox |
| Start heating up to __ °C at __ | temp + time | `53 °C`, `9:10` |
| Stop heating at __ °C at __ | temp + time | `86 °C`, `9:35` |
| Reaction start at __ °C at __ | temp + time | `98 °C`, `9:53` |
| Reaction complete at __ °C at __ | temp + time | `99 °C`, `10:31` |
| Check gel time on hot plate | step | checkbox |
| Start water removal under vacuum at __ | time | `10:31` |
| Stop heating, start cooling, __ till 35–45 °C | time | `4:00` |
| Test — pH | numeric | |
| Test — Gel time | sec | `560` |
| Test — Viscosity | sec | `39` |
| Test — Solid content @150 °C 1 hr | % | `79%` |
| **Resin yield** | kg | `1600.00` |
| Chemist sign / Incharge sign | user ref | two separate approvals |

**Yield** = `resin_yield_kg ÷ Σ(materials_kg)`. On this batch: 1600 ÷ 2971.5 = **53.8%**. That is the number the owner wants trended.

> One batch per day, typically. Entry is next-day. Batch size ~6 tonnes per the client, though the sample form shows a smaller run — confirm the range.

### 3.2 Chemical stock register

One page **per chemical per month**, handwritten in a bound book.

| Column | Type |
|---|---|
| Dt. | date |
| O.B. | kg (opening balance) |
| Received | kg |
| Total | kg (= O.B. + Received) |
| Use | kg |
| Balance | kg (= Total − Use) |

The **Phenol** page carries two extra columns — **Water** and **Resin** — recording water removed and resin produced against that day's consumption. Treat these as phenol-page-only extras, not general columns.

Cross-check from the live data: phenol `Use` reads `877` repeatedly, matching the `877.5` on the batch report. **The chemical register and the batch report are the same event recorded twice.** In the system, posting a resin batch must consume chemicals automatically — this is the first and easiest double-entry to eliminate.

Current accuracy, client's own estimate: **80–90%**.

### 3.3 Reinforcement stock list

Kept in a page-a-day diary, written as a flat list. Not a ledger — a periodic stocktake.

| Column | Type |
|---|---|
| GSM / Grade | text |
| Weight | kg (occasionally "15 Roll") |

Live values, use as seed data: `Washing F2 1500 / 1300 / 1100 / 1000 / 900`, `V-220`, `V-260`, `V-300`, `V-6x6`, `6x6`, `10x10`, `HNT`, `16x16x54`, `16x16x51`, `16x16x38`, `Star 140`, `Star 130`, `Shrijee 110`, `ISCON 110`, `ISCON 130`, `G.K. Virgin 110`, `G.K. Gold 110`, `G.K. Padding 210`, `G.K. Crystal 150`, `Star 80 Logo Toofan`, `Black 660 GSM`, `AHBO Special`.

> Naming convention is `<brand> <GSM>` for paper and `<weave>` for cloth. There is no master list today — **the item master will be created from this page plus the treater log.** Expect 40–60 reinforcement SKUs.

### 3.4 Treater / dryer log — "Quality Control Report, Dryer No. N"

Printed grid, one block per dryer per day. Three dryer lines.

| Column | Type | Notes |
|---|---|---|
| S.N. | int | |
| Cloth Name | text | `10x10`, `6x6`, `G 10x10`, `G 6x6` |
| GSM | int | `280`, `290`, `300`, `400` |
| Kushan | numeric | `920`–`1240` |
| Treated Cloth Weight | kg | *after coating* — `1686`–`2260` |
| Raw Cloth Weight | kg | *before treating* — `65`–`347` |
| Balance Raw Cloth | kg | `NIL` or a figure |
| Coated Cloth Nos | int | sheet count — `66`–`325` |
| Resine Type / Batch | FK | `P.F.` + resin batch ref |
| RC | % | `44`–`45` |
| VC | % | `2.5`–`3.5` |
| Time | time | `8.00`, `10.00`, `12.00`, `2.00`, `4.00`, `6.00` — two-hourly slots |
| DBP | kg | `15`, `16`, `17` |
| Olic Acid | kg | usually blank |
| Remarks | numeric | running totals — `637.000`, `286.400` |

**This is the only place resin consumption against a batch is recorded.** It is the link between §3.1 and §3.6. Get the FK right.

### 3.5 B-stage shelf life

Not a form — a rule, stated by the client:

- **5–7 days** nominal from coating.
- **Up to 10 days** usable, with acknowledged property degradation.
- Applies **per end product**, not per substrate — coating recipe is chosen by what is being made.
- Lots are **physically labelled** after coating.
- Stock rotation is **FIFO by default**, but deliberately broken when a grade is needed out of sequence. The client was explicit: *"mostly it is FIFO"* — so default to FIFO and allow an override with a reason.

### 3.6 Daily production batch report — `CCCPL/F/PRP/02`

The laminate pressing batch header.

| Column | Type | Notes |
|---|---|---|
| No. | int | |
| Date | date | |
| Batch No. | text | **`F/NN/MM/YYYY`** — `F/01/10/2026`, sequential within month |
| Item Description | text | grade `F2F3` + weave `10x10` / `6x6` |
| Size & Total Weight | composite | thickness → sheet count, then batch total kg |
| Checked By | user ref | |
| Remark | text | |

Live example — `F/03/10/2026`: `1.5mm = 10`, `10mm = 6`, `15mm = 6`, `25mm = 2/24`, total **996.300 kg**.

> The `2/24` notation means *2 sheets, of 24 daylights loaded*. Confirm in week 1 (§12.4).

### 3.7 Press loading register

Per press, per load. Handwritten. Pairs with §3.6 — same batch number.

| Field | Type | Notes |
|---|---|---|
| Press Number | int | `2` |
| Date | date | `2/10/26` |
| Load / Batch Number | text | `F/3/10/2026` — same batch as §3.6 |
| Per daylight: thickness | mm | `25`, `15`, `10`, `1.5` |
| Per daylight: loading weight | kg | `117.600`, `69.800`, `46.200` |
| Per daylight: grade | text | `10x10`, `F2F3` |

**Specified loading-weight range** is written at the foot of the page and is a live QC tolerance:

| Thickness | Min | Max |
|---|---|---|
| 25 mm | 117.600 | 118.200 |
| 15 mm | 69.300 | 69.800 |
| 10 mm | 45.800 | 46.300 |

Build this as a **tolerance master keyed on thickness**, warn out of band, do not block. More rows will arrive with the mould list.

### 3.8 Press heating report

Separate printed slip, per cycle. **Mostly blank in practice** — see §0.2.

Fields: Cycle No. · Mfg. Date · Load No. · Thickness mm · Hydraulic Pressure · Press No. · Forming start time · Forming complete time · Steam start time · 120 temperature · Maximum temperature (150) · Socking time · CBT maximum temp · Cooling start time · Cooling stop · Total time · Total input weight · Remarks · Incharge sign · Operator sign.

> **Build every field, default the whole section collapsed and optional.** The client's position: *"if you feel the team is wasting time on this, remove it."* A settings toggle per field group, owner-controlled.

### 3.9 Moulded products daily production register

The richest form. Pre-printed grid, **machine numbers 1–20 across the top**, two shift blocks down the page.

Per machine, per shift:

| Row | Type | Live values |
|---|---|---|
| Die No. | FK → mould master | `500`, `1155`, `1140RL`, `1138`, `4306L`, `1221`, `1142`, `520`, `177`, `7100`, `1206`, `1401RA`, `16x11x1000` |
| Die Heat Time | duration | |
| Order Qty. | int | `15`, `22`, `40`, `400`, `100`, `1000`, `10000` |
| Weight of Article | kg | `0.600`, `0.900`, `1.600`, `2.100`, `5.300`, `15.300` |
| **Weight of Chindi** | kg | cotton fibre chips input |
| Weight of Cloth | kg | |
| 1st / 2nd Shift Prod. | int | `3`, `7`, `8`, `17`, `36` |
| Start Time | time | |
| Operator Name | FK → user | `Anjani`, `Anil`, `Nagendra`, `Rajesh` |
| Top Temp | °C | **blank in practice** |
| Bottom Temp | °C | **blank in practice** |
| Curing Time | duration | **blank in practice** |
| Total | int | |

Footer: Grand Total · Weight Total · Sign. of Shift Incharge · Sign. of Store Incharge · Authorised Sign.

> Three signature roles on one document. Model as a three-step approval, but **do not block** production posting on approval — the floor cannot wait for a signature.

### 3.10 Thickness inspection register

The 12-point grid. Handwritten.

Structure per board: **4 rows × 3 readings = 12 points**, rows labelled by position (`4'`, `8'`, `4'`, `8'`).

| Field | Type | Notes |
|---|---|---|
| Date | date | `2/9/26` |
| Lot ref | text | `F/61/9/26` |
| Press / daylight | text | `F2 F3`, `D4` |
| Target + tolerance | text | `10 ± 10`, `27mm` |
| 12 readings | mm × 12 | `10.6`, `10.8`, `11.00`, `27.4`, `25.6` … |

> `10 ± 10` almost certainly means ±0.10 mm, not ±10. **Confirm before building the tolerance check (§12.5).** Getting this wrong makes every board either always-pass or always-fail.

### 3.11 Finished goods inspection test report — `CCCPL/F/QC/04`

| Column | Type | Notes |
|---|---|---|
| Sr. | int | |
| Batch Number | FK | `F/34/10/26`, `F/35/9/26`, `F/38/9/26`, `F/39/9/26` |
| Item Description | text | `MUS2 10x10`, `Paper 6x6`, `Fabric 10x10`, `Fabric 6x6`, `Tube 6x6`, `Rubber W-10x10`, `Coffee P1`, `P2 (m)` |
| Sheet Size | text | `8x4`, `6x6`, `1906x1250` |
| Quantity Kgs | kg | |
| Thickness | mm | `1`, `1.5`, `2`, `3`, `5`, `10`, `16`, `20`, `25`, `50`, `60` |
| Reason for Rejection | text | see below |
| Q.C. Inspector / Approved By | user ref | |

> ⚠ **The "Reason for Rejection" column is not used for rejections.** Live values are `Allocation`, `Export`, `Sheet`, `Cut`, `P.B`, `D.R`, `Stock` — these are **dispositions**, i.e. where the material is going. Model it as `disposition` with a managed list, and add a *separate* genuine `rejection_reason`. Flag this to the client; it is a form they will want corrected.

### 3.12 Despatch weighment register

Per customer, per despatch. Handwritten.

| Field | Type | Notes |
|---|---|---|
| Customer | text | `K.M. Mumbai`, `K.B.` |
| Sheet size | text | `8x4`, `6x6` |
| Thickness–count | text | `10-16`, `12-10`, `15-5`, `6-5`, `8-5` |
| Individual weights | kg × N | `43.450`, `42.150`, `42.850` … to 3 dp |
| Row total | kg | `214.450` |

Five weights per row then a total — bundle or pallet weights. **Confirm the grouping unit (§12.6).**

---

## 4. Data model

### 4.1 Masters

```sql
-- Chemicals, reinforcement, resin, pre-preg, finished goods all live here.
item(
  id, code, name,
  item_class ENUM('CHEMICAL','REINFORCEMENT','RESIN','PREPREG',
                  'FINISHED','CONSUMABLE','BOUGHT_IN'),
  base_uom ENUM('KG','NOS') DEFAULT 'KG',   -- Q1: KG unless moulded
  gsm INT NULL,                 -- reinforcement only
  weave TEXT NULL,              -- '10x10','6x6','16x16x54'
  brand TEXT NULL,              -- 'ISCON','G.K.','Star','Shrijee','AHBO'
  grade_id FK NULL,
  thickness_mm NUMERIC(6,2) NULL,
  sheet_size TEXT NULL,         -- '8x4','6x6','1906x1250'
  shelf_life_days INT NULL,     -- 7 for PREPREG, NULL elsewhere
  is_saleable BOOLEAN,          -- Q4: prepreg is TRUE
  reorder_level_kg NUMERIC(12,3) NULL,
  is_active
)

grade(id, code, name, is_active)
-- Resin grades: PFC, PFA, PFAC, E-GLASS. Laminate grades: F2F3 and others.
-- Two different grade vocabularies — confirm whether one table or two (§12.2).

location(id, code, name, kind ENUM('WAREHOUSE','TANK','RACK','SHOPFLOOR'))
-- General only at go-live: Warehouse A / B. Client explicitly deferred
-- bin-level location. Do NOT build a bin hierarchy now (§11).

reactor(id, code, name, capacity_kg, is_active)
-- CCCPL-VES-1, CCCPL-VES-2, ...

dryer(id, code, name, is_active)          -- 3 lines + 1 mixer oven
press(id, number, press_type ENUM('SMALL','BIG'), daylight_count, is_active)
-- 25 total, 20–21 operational. Numbers 1–20 small, 21–24 big.

mould(
  id, die_no,                   -- '1155','1140RL','4306L','115N','16x11x1000'
  description, mould_type ENUM('PLATE','DIE'),
  size TEXT, finish ENUM('MIRROR','SATIN') NULL,
  customer_id FK NULL,          -- dies ARE customer-linked; plates are NOT
  location_id FK NULL, is_active
)
-- ~3000 rows. Client HAS a numbering scheme and an Excel list — import it,
-- do not invent one.

party(id, name, party_type[], gstin, phone_e164, country,
      is_export BOOLEAN, payment_terms, is_active)
-- CUSTOMER / VENDOR / TRANSPORTER / JOBWORK

loading_tolerance(id, thickness_mm, min_kg, max_kg, effective_from)
-- §3.7. Seeded with 25/15/10 mm. Warn out of band, never block.
```

### 4.2 Stock ledger

**Append-only. Balances are derived.** Same architecture as the Vishal build, and for the same reason — the client's complaint is *"we are not aware where it is kept"*, which only a movement history answers.

```sql
stock_movement(
  id BIGSERIAL, occurred_at, created_at, created_by,
  doc_type ENUM('PURCHASE_IN','RESIN_CONSUME','RESIN_PRODUCE',
                'COAT_CONSUME','COAT_PRODUCE','PRESS_CONSUME','PRESS_PRODUCE',
                'MOULD_CONSUME','MOULD_PRODUCE','TRIM_LOSS','SCRAP',
                'FG_DIRECT_IN','SALE_OUT','ADJUSTMENT','STOCKTAKE'),
  doc_id, doc_line_id,
  item_id, lot_id NULL, location_id,
  qty_kg NUMERIC(12,3),      -- signed: +in, −out. NEVER zero.
  qty_nos INTEGER NULL,      -- moulded items only
  note
)

CREATE INDEX ON stock_movement (item_id, location_id, occurred_at);
CREATE INDEX ON stock_movement (lot_id) WHERE lot_id IS NOT NULL;

lot(
  id, lot_code,              -- 'F/03/10/2026', 'CCCPL/110726/06'
  item_id, produced_on,
  expires_on DATE NULL,      -- produced_on + shelf_life_days (PREPREG only)
  parent_lot_ids BIGINT[],   -- traceability chain
  status ENUM('ACTIVE','CONSUMED','EXPIRED','SOLD','SCRAPPED')
)
```

A balance is `SUM(qty_kg)` grouped by `(item, location)`, or by `(lot)` where lots apply. Materialise if needed, but the ledger stays authoritative and a nightly job must assert the summary matches.

### 4.3 Production documents

```sql
resin_batch(
  id, batch_no,              -- CCCPL/DDMMYY/NN
  batch_date, reactor_id, grade_id,
  ph_checked, stir1_done, cooled_done, stir2_done,
  heat_start_temp, heat_start_time, heat_stop_temp, heat_stop_time,
  reaction_start_temp, reaction_start_time,
  reaction_complete_temp, reaction_complete_time,
  gel_time_checked, vacuum_start_time, cooling_start_time,
  test_ph, test_gel_time_sec, test_viscosity_sec, test_solid_content_pct,
  yield_kg NUMERIC(12,3),
  status ENUM('DRAFT','POSTED','FAILED'),
  chemist_id, incharge_id, failed_reason TEXT NULL
)
resin_batch_material(id, batch_id, item_id, qty_kg)
-- Posting consumes materials and produces yield_kg of RESIN in one transaction.
-- status='FAILED' consumes materials, produces NOTHING, writes a SCRAP movement (Q5).

coating_run(
  id, run_date, dryer_id, shift,
  cloth_item_id, gsm, kushan,
  treated_cloth_weight_kg, raw_cloth_weight_kg, balance_raw_cloth_kg,
  coated_cloth_nos, resin_batch_id FK, resin_type,
  rc_pct, vc_pct, slot_time, dbp_kg, oleic_acid_kg, remarks_total_kg,
  output_lot_id FK
)
-- Produces a PREPREG lot with expires_on = run_date + 7.

press_batch(
  id, batch_no,              -- F/NN/MM/YYYY
  batch_date, press_id, grade_id, weave,
  total_weight_kg, checked_by, remark,
  status ENUM('PLANNED','LOADED','CURED','COMPLETE')
)
press_batch_daylight(
  id, press_batch_id, daylight_no,
  thickness_mm, loading_weight_kg, grade_id,
  prepreg_lot_id FK, sheet_count INT,
  tolerance_ok BOOLEAN         -- computed against loading_tolerance
)
-- Q3: one header, N daylight lines, multi-SKU output.

press_heating(                 -- §3.8 — optional, default collapsed
  id, press_batch_id, cycle_no, load_no, thickness_mm,
  hydraulic_pressure, forming_start, forming_complete, steam_start,
  temp_120_at, max_temp_at, socking_time, cbt_max_temp,
  cooling_start, cooling_stop, total_time, total_input_weight_kg,
  remarks, incharge_id, operator_id
)

moulding_entry(
  id, entry_date, shift ENUM('1','2'), press_id, mould_id,
  die_heat_time, order_qty, weight_of_article_kg,
  weight_of_chindi_kg, weight_of_cloth_kg,
  shift_production_nos, start_time, operator_id,
  top_temp NULL, bottom_temp NULL, curing_time NULL,   -- optional §0.2
  total_nos,
  shift_incharge_id, store_incharge_id, authorised_by_id
)
```

### 4.4 Quality

```sql
thickness_inspection(
  id, inspected_on, lot_id, press_batch_id, daylight_no,
  target_mm, tolerance_mm, inspector_id
)
thickness_reading(
  id, inspection_id, position_label,   -- "4'", "8'"
  reading_1 NUMERIC(6,2), reading_2 NUMERIC(6,2), reading_3 NUMERIC(6,2)
)
-- 4 rows × 3 readings = the 12-point grid.

fg_inspection(
  id, inspected_on, batch_no, item_id, sheet_size,
  quantity_kg, thickness_mm,
  disposition ENUM('ALLOCATION','EXPORT','SHEET','CUT','PB','DR','STOCK'),
  rejection_reason TEXT NULL,          -- genuinely separate, see §3.11
  inspector_id, approved_by_id
)

lab_test(
  id, lot_id, customer_id NULL, test_type ENUM('MECHANICAL','ELECTRICAL'),
  standard TEXT,                       -- IS 2036, NEMA, IEC, BIS
  report_file_url, tested_on, tested_by_id
)
-- NO parameter capture. Upload the report file. The client was explicit:
-- "just only write if QC is done, and attach the report."
-- On a repeat test for the same item+customer, offer to copy the previous record.
```

### 4.5 Sales, purchase, despatch

```sql
enquiry(id, source ENUM('INDIAMART','WHATSAPP','EMAIL','PHONE','WALKIN','REFERRAL'),
        received_at, party_id NULL, raw_contact, subject, body,
        owner_id, stage ENUM('NEW','QUOTED','NEGOTIATING','WON','LOST'),
        next_action_at, next_action_note, lost_reason)

quotation(id, quote_no, party_id, quote_date, valid_until,
          currency, incoterm ENUM('FOB','CIF','CNF','EXW') NULL,
          status, total_amount, pdf_url, enquiry_id FK)
quotation_line(id, quotation_id, item_id, qty_kg, rate, amount)

sales_order(id, so_no, party_id, order_date, po_ref, promised_date,
            incoterm, port_of_loading, destination_country, status)
sales_order_line(id, so_id, item_id, sheet_size, thickness_mm,
                 qty_kg, qty_nos NULL, rate, amount, mould_id FK NULL)
-- Dies are assigned against the customer order (client confirmed).

purchase_order(id, po_no, party_id, po_date, expected_date, status)
purchase_order_line(id, po_id, item_id, qty_kg, rate, amount)
grn(id, grn_no, po_id, party_id, received_on, supplier_invoice_no)
grn_line(id, grn_id, po_line_id, item_id, qty_kg, supplier_lot, qc_status)

despatch(id, despatch_no, so_id, party_id, despatch_date,
         pack_type ENUM('PALLET','PP_WRAP_LDP'),
         transporter_id, vehicle_no, lr_no, container_no,
         port, invoice_no, eway_no, irn)
despatch_line(id, despatch_id, item_id, lot_id, sheet_size,
              thickness_mm, piece_count, qty_kg)
despatch_weight(id, despatch_line_id, seq, weight_kg)
-- §3.12: individual bundle weights, 3 dp, with a derived line total.

tally_sync_log(id, doc_type, doc_id, direction, payload JSONB,
               status, error, synced_at)
```

---

## 5. Business rules

Numbered so QA writes one test per rule.

### 5.1 Resin

- **BR-1** Posting a resin batch consumes each `resin_batch_material` line from stock and produces `yield_kg` of the batch grade, in one transaction.
- **BR-2** `yield_pct = yield_kg ÷ Σ(material qty_kg)`, computed and stored on post. Trend it per grade per reactor.
- **BR-3** A batch marked `FAILED` consumes materials and produces **nothing**. Write the full input weight as a `SCRAP` movement. No rework, no downgrade (Q5).
- **BR-4** Chemical stock is consumed by the batch posting. **The chemical register is not a separate entry screen** — it is a *report* derived from movements, rendered in the exact column layout of §3.2 so the storekeeper can still read it as his register.
- **BR-5** Materials beyond those on the printed form must be addable without a code change.

### 5.2 Coating

- **BR-6** A coating run consumes reinforcement and resin, and produces one `PREPREG` lot.
- **BR-7** `expires_on = run_date + item.shelf_life_days` (default 7). Configurable per item.
- **BR-8** Lots at **day 5** raise a notification to the production head and the owner. Lots past `expires_on` are **blocked from press batch selection** but remain visible and saleable with an override.
- **BR-9** The prepreg picker **defaults to FIFO** by `produced_on`, with an explicit override that requires a reason (§3.5).
- **BR-10** RC% and VC% out of their configured band raise a warning, never a block.

### 5.3 Pressing

- **BR-11** A press batch is a header plus N daylight lines. Posting consumes the selected prepreg lots and produces one output lot **per distinct thickness** (Q3).
- **BR-12** `loading_weight_kg` outside `loading_tolerance` for that thickness raises a warning on save, logged against the batch. Never blocks.
- **BR-13** Batch numbering `F/NN/MM/YYYY` auto-increments within the month. The sequence must be **gap-free and user-visible** — they will cross-check it against the book.
- **BR-14** The heating section (§3.8) is optional and owner-togglable. When off, those fields neither render nor validate.

### 5.4 Moulding

- **BR-15** One entry per machine per shift. `total_nos` is the shift production.
- **BR-16** Consumes `weight_of_chindi_kg` + `weight_of_cloth_kg` (and prepreg where applicable), produces `shift_production_nos` units of the moulded item at `weight_of_article_kg` each.
- **BR-17** `mould_id` must be free for that shift. A die booked on two machines in one shift is a hard block — this is the mould-availability constraint the system exists to enforce.
- **BR-18** Temperature and curing fields are optional (§0.2). Never required for posting.

### 5.5 Cutting, QC and finished goods

- **BR-19** Trim loss is captured as a `TRIM_LOSS` movement. Expected **7–8% for sheets, 5% for moulded**; outside ±2 points of expectation, warn. Trim scrap is **not** recoverable — it does not re-enter stock.
- **BR-20** Thickness inspection requires all 12 readings before the board can be cleared.
- **BR-21** `fg_inspection.disposition` is mandatory; `rejection_reason` is optional and separate (§3.11).
- **BR-22** Finished goods may be created **without a production batch** (`FG_DIRECT_IN`) for bought-in trading stock (Q6). Raw material may likewise be sold directly.
- **BR-23** Lab test records attach a file. No parameter capture. On a repeat test for the same `(item, customer)`, offer one-click copy of the previous record.

### 5.6 Sales and despatch

- **BR-24** An enquiry from any source creates a pipeline row with an owner and a next action. Overdue actions escalate to the owner's dashboard.
- **BR-25** Quotation → sales order conversion carries lines across without re-entry.
- **BR-26** Despatch deducts from finished-goods stock by lot. Over-despatch is a hard block.
- **BR-27** Individual bundle weights are captured per despatch line; the line total is **derived, never typed** (§3.12).
- **BR-28** Invoice, packing list, e-way and proforma generate from the despatch. Generated once, pushed to Tally, IRN and e-way written back onto the despatch record.

### 5.7 Tally

- **BR-29** One-way push: ERP → Tally, for sales invoices, purchase bills and jobwork. **Tally is never replaced.** The client's accounts team continues as today.
- **BR-30** Every push is logged with payload and response. Failures queue and retry; they never silently drop.
- **BR-31** Ledger mapping is configured, not hardcoded — settled with the accountant at the second visit.

---

## 6. Bulk upload — P1, not optional

Re-read §0.3. A dedicated operator will key a day's registers at end of day for the first 3–4 months. The client asked for this directly and Nick committed to it: *"I will give you the Excel sheets in their format and press the upload button."*

For each register in §3, ship:

1. **A download template** — an `.xlsx` whose columns are exactly that register's columns, in the register's order, with the date pre-filled.
2. **An upload endpoint** — CSV and XLSX, with a **dry-run preview**: row count, detected errors, and what will be created, before anything commits.
3. **Row-level error reporting** — never reject the whole file. Import the good rows, return a downloadable error file containing only the failures with a reason column appended.
4. **Idempotency** — re-uploading the same file must not double-post. Key on `(register_type, date, natural_key)`.

This is the single highest-leverage feature in the first release. If entry is painful, nothing else matters.

---

## 7. Screens

**P1** must ship for the mid-November prototype. **P2** by go-live. **P3** structure only.

| # | Screen | Pri | Notes |
|---|---|---|---|
| S1 | **Owner dashboard** | P1 | His three stated questions, nothing more: *what was produced today* (stage-3 output), *is it tracking to plan*, *any breakdown reported*. Resist adding a fourth tile. |
| S2 | Stock — all classes | P1 | One grid, filter by class and location. Weight-first. Search-as-you-type on item name. |
| S3 | Resin batch entry | P1 | §3.1 field-for-field. Materials grid, step checkboxes, test block, yield auto-computed. |
| S4 | Chemical register **report** | P1 | §3.2 layout exactly, derived from movements. Printable. Monthly, per chemical. |
| S5 | Coating / dryer log | P1 | §3.4 grid. Three dryers as tabs. |
| S6 | **Pre-preg board** | P1 | Lots by age with the day counter. Day 5 amber, past expiry red. Actions: consume, sell, scrap. |
| S7 | Press batch entry | P1 | Header + daylight lines. Tolerance warning inline. |
| S8 | Moulding daily entry | P1 | §3.9 — machines 1–20 across, shift block down. The hardest grid in the build; prototype it first. |
| S9 | Thickness inspection | P1 | 12-point grid, 4×3 layout. |
| S10 | FG inspection | P1 | §3.11, disposition mandatory. |
| S11 | Mould / die master | P1 | ~3000 rows. Import from their Excel. Availability view by shift. |
| S12 | Item, party, grade masters | P1 | Plain CRUD. |
| S13 | **Bulk upload centre** | P1 | §6. One tile per register, template download, dry-run preview. |
| S14 | Sales order + despatch | P2 | Lot picking, bundle weights, document generation. |
| S15 | CRM pipeline | P2 | Enquiry sources, owner, next action, reminders. |
| S16 | Quotation | P2 | → sales order conversion. |
| S17 | Purchase + GRN | P2 | PO, receipt by weight, supplier lot capture. |
| S18 | Lab test register | P2 | File upload, copy-previous. |
| S19 | Tally sync console | P2 | Queue, failures, retry. |
| S20 | Users, roles, audit | P3 | Enforced from day one; admin UI can be basic. |

### UI conventions

- **Register-shaped.** Dense grids, zebra rows, right-aligned numerics, sticky headers and totals. No cards, no kanban on operational screens.
- **Entry screens mirror the paper.** Tab order follows the physical form. Enter commits a row and moves to the next.
- **Mobile-native feel.** S2, S6, S8 and S10 must be genuinely usable one-handed. The owner travels 10–12 days a month and will check from his phone.
- **Language.** English UI, Hindi labels available per user. Keep their vocabulary: **Chindi**, **Kushan**, **Daylight**, **Die No.**, **B-stage**, **Batch**. Do not translate these.
- **Weight everywhere.** Three decimals, kg, always. Piece counts only on moulded items.

---

## 8. Roles

| Role | Sees |
|---|---|
| Owner (Dhairya, father) | Everything, all costs and margins |
| **Floor supervisor** (named; tech-savvy of the two) | All production, no costs. The single internal owner of the rollout. |
| Resin operator | S3 only |
| Coating operator | S5, S6 |
| Moulding / press operator | S7, S8 |
| Finished goods / despatch | S2, S10, S14 |
| Lab | S9, S18 |
| Data entry operator | S13 plus write access to every register screen |
| Accounts (Ahmedabad, 3 users) | S19, read-only on sales and purchase |
| Sales (Ahmedabad) | S15, S16, read-only stock |

Costs and margins are visible to the owner only. Everyone else sees quantities.

---

## 9. Connectivity

The plant is 15 km out and runs on a mobile hotspot. Treat this as a hard constraint, not an edge case.

- **Budget:** first meaningful paint under 3 s on a 3G profile. No image-heavy screens. Lazy-load everything below the fold.
- **Offline entry:** service worker caches the app shell and masters. Entry screens queue locally and sync on reconnect, with a visible pending-sync badge.
- **Conflict policy:** last-write-wins per document, with a conflict log the owner can review. Do not build CRDT merging — it is not worth it here.
- **Hosting:** if the signal survey shows the plant drops repeatedly, a **plant-local server with cloud replication** beats a pure cloud deployment. See §12.1 — this is a week-1 decision and it changes the deployment architecture.

---

## 10. Delivery plan

| Week | Work | Exit condition |
|---|---|---|
| 1 | Spec sign-off. Collect the outstanding documents (§13). Resolve §12. Profile the mould Excel. | **Signed field-level specification.** |
| 2 | Schema, auth, masters, item + mould import. Bulk-upload framework. | Their mould list and item master live in the system. |
| 3 | Resin batch, chemical register report, coating run, pre-preg lots and expiry. | A resin batch posts, consumes chemicals, and a pre-preg lot starts its clock. |
| 4 | Press batch + daylights, moulding entry, thickness and FG inspection. | A full chemical→sheet chain is demonstrable end to end. |
| 5 | Stock screens, owner dashboard, bulk upload for every register, polish. | **Prototype ready for the mid-November demo.** |
| 6–8 | CRM, quotation, sales order, despatch, documents, Tally sync. | Invoice generates and lands in Tally. |
| 9–10 | Migration of opening balances, parallel run begins, on-site training. | Both systems agree on stock. |
| 11–12 | Cutover, go-live, stabilisation. | Go-live before year-end. |

> The mid-November demo (after Diwali) is a **hard date** and it is the client's first impression. Nick's instruction: *"I have to give it to them only after making it near perfect because they are not tech-savvy."* Prioritise polish on S3, S6 and S8 over breadth. A narrow, excellent prototype beats a wide, rough one with this client.

---

## 11. Explicitly out of scope

Contractual. Any of these mid-build is a change order.

| Excluded | Note |
|---|---|
| Tablets / screens on the shop floor | **Deferred to phase 2** — client's decision on the day. |
| PLC and machine integration | No PLCs installed. Client: *"those machines are of no use to us."* |
| In-process parameter testing | Testing happens at raw material in and finished goods out only. |
| Lab parameter capture | File upload only (BR-23). |
| Bin-level location tracking | Warehouse-level only at go-live. |
| Replacing Tally | One-way sync (BR-29). |
| Demand forecasting | Needs history that does not exist yet. Revisit 6–9 months post-go-live. |
| HRMS, attendance, payroll | Separate engagement. |
| Per-sheet serialisation | Batch and lot level only. |
| The EPC company (Creative Carbon Pvt. Ltd.) | Separate, later engagement. |
| Website, branding, catalogue | Separate project. |
| Marketing automation | Client excluded it explicitly. |

---

## 12. Open decisions — resolve in week 1

1. **Hosting: cloud or plant-local server.** Depends on the signal survey taken on the day. Changes the deployment architecture — settle before week 2. (§9)
2. **Grade vocabulary.** Resin grades (`PFC`/`PFA`/`PFAC`/`E-GLASS`) and laminate grades (`F2F3`) appear to be different namespaces. One table with a type column, or two? Confirm against the grades list when it arrives.
3. **Resin batch size.** Client said ~6 tonnes; the sample form totals 2,971.5 kg in with 1,600 kg out. Confirm the normal range and whether vessel capacity constrains it.
4. **The `2/24` notation** on the daily production batch report (§3.6) — 2 sheets of 24 daylights, or something else?
5. **`10 ± 10` tolerance** on the thickness register (§3.10). Almost certainly ±0.10 mm. Confirm before building the check.
6. **Despatch weighment grouping** (§3.12) — are the five weights per row bundles, pallets or sheets?
7. **`Kushan` on the treater log** (§3.4) — what is it? Values 920–1240. Machine speed, a batch reference, or a cloth attribute? Nobody asked on the day.
8. **DBP and Oleic Acid** on the treater log — additives consumed per run? If so they must deduct from chemical stock.
9. **Reinforcement item master** — expect 40–60 SKUs from §3.3, but the brands and GSMs need confirming against purchase records.
10. **Opening balances** — full history import, or masters plus opening stock as of cutover? Recommend the latter; registers are 80–90% accurate and importing inaccurate history poisons the yield trends.
11. **Mould-to-customer linkage** — dies are customer-linked, plates are not. Confirm that plates never need customer assignment.

---

## 13. Client-side blocking dependencies

Promised on the day, chase in week 1. Nothing in weeks 2–3 can complete without the first four.

- [ ] **Grades list** — resin and laminate
- [ ] **Mould / die list** (Excel, ~3000 rows) — blocks S11 and BR-17
- [ ] **Moulding job card** — the one form not yet photographed
- [ ] **One week's production plan**, as it physically exists
- [ ] Batch registers and opening stock for all three departments
- [ ] Test report samples — mechanical and electrical
- [ ] Complete despatch document set for one order (packing list + invoice)
- [ ] Sample quotation, sample proforma, sample purchase order
- [ ] B-stage sale invoice sample
- [ ] Tally ledger and field values *(second visit, with the accountant)*
- [ ] **Named floor supervisor** and two points of contact
- [ ] Separate WhatsApp Business number for CRM intake

---

## 14. Reference — vocabulary from their own registers

Use these in seed data, fixtures and the demo. Specificity is what makes the prototype feel like theirs.

**Form codes:** `CCCPL/F/QC/03` (resin batch) · `CCCPL/F/QC/04` (FG inspection) · `CCCPL/F/PRP/02` (daily production batch)

**Batch numbering:** resin `CCCPL/110726/06` · laminate `F/03/10/2026` · older laminate `F/61/9/26`

**Reactors:** `CCCPL-VES-2`

**Resin grades:** PFC · PFA · PFAC · E-GLASS   **Resin type:** P.F.

**Chemicals:** Phenol · Formaldehyde · Cardinol · Liquid Ammonia · Caustic Soda Flakes · Methanol · Oxalic Acid

**Reinforcement:** ISCON 110 · ISCON 130 · G.K. Virgin 110 · G.K. Gold 110 · G.K. Padding 210 · G.K. Crystal 150 · Star 140 · Star 130 · Star 80 Logo Toofan · Shrijee 110 · Black 660 GSM · AHBO Special · weaves 6x6, 10x10, 16x16x54, 16x16x51, 16x16x38 · Chindi (cotton fibre chips)

**Laminate grade:** F2F3

**Die numbers:** 500 · 177 · 520 · 1138 · 1142 · 1155 · 1206 · 1221 · 1230 · 4306L · 7100 · 1140RL · 1401RA · 115N · 16x11x1000

**Item descriptions (FG):** MUS2 10x10 · Paper 6x6 · Fabric 10x10 · Fabric 6x6 · Tube 6x6 · Rubber W-10x10 · Coffee P1 · P2 (m)

**Sheet sizes:** 8x4 · 6x6 · 1906x1250 mm   **Thicknesses:** 1 · 1.5 · 2 · 3 · 5 · 10 · 15 · 16 · 20 · 25 · 27 · 35 · 50 · 60 mm

**Dispositions:** Allocation · Export · Sheet · Cut · P.B · D.R · Stock

**Operators:** Anjani · Anil · Nagendra · Rajesh · Bharat

**Standards:** IS 2036 · NEMA · IEC · BIS

**Ports:** Mundra · Kandla · JNPT / Nhava Sheva   **Markets:** USA · UK · Canada · Ireland · Turkey · Malaysia · Middle East · Africa · South America — 20+ countries

**Loading tolerance (seed `loading_tolerance`):**

| Thickness | Min kg | Max kg |
|---|---|---|
| 25 mm | 117.600 | 118.200 |
| 15 mm | 69.300 | 69.800 |
| 10 mm | 45.800 | 46.300 |

**Live batch for the demo fixture — `F/03/10/2026`, 2 Oct 2026, Press 2, grade F2F3, weave 10x10:**

| Thickness | Sheets | Loading weight |
|---|---|---|
| 1.5 mm | 10 | 6.200 / 6.400 |
| 10 mm | 6 | 45.800–46.600 |
| 15 mm | 6 | 69.700–69.800 |
| 25 mm | 2 of 24 | 117.600 / 118.200 |
| **Batch total** | | **996.300 kg** |

Build the prototype demo around this batch. It is real, it is recent, and he will recognise every number in it.
