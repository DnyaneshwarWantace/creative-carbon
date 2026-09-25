# Dermat Orders — one-page order flow

## TLDR

New module `dermat_orders`. An order is created on one page (customer → Finished Goods in pieces → the client's own order-form specs) and then lives on one order page: a stage rail (done green, current orange, on hold red, coming grey), one responsible person per stage, a right-side form per stage, material needs from the BOM, and a history log. Order number `DER/SO/<FY>/<0001>` (e.g. `DER/SO/2526/0001`, FY April–March).

## Sources

- Standard recording 16:25–17:49: prices locked → **advance arrives = order official** → sampling after the order → two branches (artwork/packaging and formulation/production) that merge at the end. 17:04: track which R&D number a sample was for. 28:59–29:05: repeat order must not re-enter everything. 29:38: a revised order becomes a new order.
- Dermat India 4, 15:15–16:25: show previous, current and next stages (green / orange-red / future); whoever the order is stuck with gets a morning email of pending steps; hold statuses (client side etc.) with a responsible person; days taken per person.
- Client paper order form ("Purchase order (for office use only)"): Order date, Batch no, Company, Brand name, Pack size, MRP, Quantity; Production specifications (Colour, Fragrance, Texture, Sample name, R&D sample batch no., Expiry month, Mfg month, Production remarks); Tube/Bottle packaging specifications (Name, Packing code, Cap colour, Body colour, Round or oval tube, Labelled or printed tube, Matt or glossy finishing, Tube/bottle vendor, Leafing/UV/Foiling, Packaging remarks); Secondary packaging specifications (Drip-off spot UV / Thermal matt lamination / Metallic spot UV, Shrink pack, Hologram / Leaflet, Carton vendor, Packaging remarks). Each has a remark; "Party side" is common.
- Client order-book Excel: Designer status list ORDERED / PM OK / Client Side / Artwork / Half PM OK / Hold / Need to Order PM + free-text status.
- Procuzy sales order (field reference only): SO #, SO date, delivery date, customer, GST number, payment terms, payment remarks, sales manager, product / billing / packing remarks; lines Product, Quantity, Batch number, Unit price, MRP.

## Data model

- `dermat_orders`: order_no, order_date, delivery_date, customer_id (customers entity id — name read with decryption, never copied), customer_po_ref, order_type (new / repeat / revision), source_order_id, sales_manager, payment_terms, payment_remarks, product_remarks, billing_remarks, packing_remarks, status (booked → confirmed → completed / cancelled; on_hold derived), created_by_name, timestamps.
- `dermat_order_lines`: order_id, position, product_id (Finished Good), brand_name, pack_size, mrp, quantity (pieces), rate, batch_no, specs jsonb `{ production: {...}, primary: {...}, secondary: {...} }` using the client form keys.
- `dermat_order_stages`: order_id, stage_key, status (waiting / open / on_hold / done / skipped), responsible_user_id, responsible_name, data jsonb, hold_reason, hold_party, opened_at, completed_at, completed_by_name.
- `dermat_order_events`: order_id, stage_key, action (created / saved / completed / held / resumed / reverted / skipped / assigned / edited), note, by_name, created_at.

## Stages and sub-steps (code config `lib/stages.ts`)

Production split per the client's 3-stage production diagram (Manufacturing kg/ml → Filling bottles/gm/ml → Packing pieces, each with its own steps).

| # | Stage | Department (sidebar) | Opens after | Sub-steps (ticked with name + time; "if needed" = optional) |
|---|---|---|---|---|
| 1 | Order booked | Sales | — | — |
| 2 | Advance received | Accounts | 1 | PI sent · Advance received in bank |
| 3 | Sampling / R&D (skip for repeat) | R&D | 2 | R&D request received · Sample made · Sample sent · Client approved |
| 4a | Artwork & packaging | QA | 3 | Artwork designed · Client approved · QA finalised · PM ordered · PM received (PM OK) |
| 4b | Formula & BOM | R&D | 3 | automatic: every product needs an approved BOM |
| 5 | Material planning | Planning | 4a + 4b | Checked against stock · Stock reserved · Purchase raised (if needed) · Material received & QC approved (if needed) |
| 6 | Manufacturing (kg) | Production | 5 | Requirement to store · Manufacturing done · Bulk QC passed |
| 7 | Filling (bottles) | Production | 6 | Bottle/tube requirement · Filling done · QC after filling (if needed) |
| 8 | Packing (pieces) | Production | 7 | FG sample made · Final QC passed · All packaging done |
| 9 | QA release | QA | 8 | Batch documents checked · Released for dispatch |
| 10 | Billing & payment | Accounts | 9 | Invoice raised · Balance received |
| 11 | Dispatch | Dispatch | 10 | Dispatched · Delivered (if needed) |

Each stage also has its own form fields (required ones marked). "Mark done" needs the required fields and required steps. Actions: save, tick step, complete, hold (reason + whose side), resume, reopen (reason; later open stages go back to waiting), skip (sampling), assign responsible person. Status: booked until advance done, confirmed after, completed after dispatch. Products/quantities lock once manufacturing is done.

Every stage (2–11) has its own work page in its department's sidebar group (`/backend/work/<stage>`: To do / Coming next / Done); completing it there is the same as on the order page, and the order moves to the next department.

## API (`/api/dermat_orders/...`)

- `GET orders` list (search order no / customer / product, status, stage, page) or `?id=` detail with lines, stages, events, customer.
- `POST orders` create; `PUT orders` update header + lines (lines locked once production is done).
- `POST orders/stage` `{ orderId, stageKey, action, data?, note?, holdParty?, responsibleUserId?, stepKey?, done? }`.
- `POST orders/cancel` `{ id, reason }`.
- List filters: `stage` + `stageStatus` (active / waiting / done), `status`, `customerId`, `productId`, `search`.
- `GET people` users for the responsible picker.

## Screens

- Sales → Orders (`/backend/orders`): order book with stage chips, responsible, days in stage, filters.
- Sales → New order (`/backend/orders/new`, `?copyFrom=` for repeat): one page, no wizard.
- Order page (`/backend/orders/<id>`): header, stage rail, stage sheet, lines with specs, material needs, history. Links to customer, products, BOMs.
- Stage work pages (`/backend/work/<stage>`) per department.
- Product page (Finished Good): orders for this product.

## Later

Morning email digest, department work queues, order-specific BOM copy, planning reservations, production batches.

## Changelog

- 2026-09-25: Spec created.
- 2026-09-25: Implemented. Production split into Manufacturing / Filling / Packing; sub-steps; stage work pages. Order flow API test 39/39.

## Known data issue

The 10 demo customers created before 2026-09-23 were encrypted with an older key; their names cannot be decrypted. Order screens fall back to the readable Legal / Trade Name. Re-saving their names (or re-creating them) fixes the Customer page.
