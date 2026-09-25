# Dermat planning board and stock reservations

## TLDR

Planning picks several orders (each line's quantity editable in the plan only) and/or product BOMs with a quantity ("what if"), explodes every BOM, and adds the same material into one row: needed, in RM/PM store, held for other orders, free, reserved here, short. Stock is reserved per order without being deducted. A reservation never expires. Reserved stock cannot be used by another order until it is cleared or moved; the store refuses to issue it. Issuing to the order uses up its reservation. Cancelling or completing an order releases its reservations.

Module: `dermat_planning`.

## Sources

- Dermat India 4 · 8:13–9:37: reserve stock is the most important feature; reserve, do not debit; five orders made at different times; total requirement (219 → order 220); planning tab adds the same RM across orders.
- Dermat India 4 · 20:23–20:43: order may wait 6 months in planning for material from China.
- Dermat India 3 · 12:52–16:39: weekly planning across multiple orders; select orders → total; reserving is manual; Excel-like with edit option; 15:00 give reserved material to another order.
- Standard recording · 37:51: plan 98 where the order needs 100.
- Procuzy MRP screen: Ordered / Fulfilled / Reserved / To be ordered; Reserve Stock / Clear Reservation.

## Decision

Reservations live in `dermat_planning_reservations` (one row per order + material), not in wms reservations: wms reservations bind to storage buckets (including PRODUCTION), which would block the "used" adjustment of issued stock. Free = RM-STORE + PM-STORE on hand − all reservations.

## Data

- `dermat_planning_reservations`: order_id, order_no, product_id, quantity, since (kept when the quantity changes), by_name, note. Unique (org, tenant, order, product).
- `dermat_planning_log`: reserve / clear / move / issued, from/to order, quantity, note, by, at.
- `dermat_planning_plans`: `DER/PL/<FY>/<nnn>`, name, notes, items `[{key, orderId, lineId, productId, quantity}]`.

## API

- `GET /api/dermat_planning/orders` — booked/confirmed orders with lines, BOM approved flag, planning stage status, reserved count.
- `POST /api/dermat_planning/calculate` — `{ items }` → rows + `missingBoms`.
- `GET /api/dermat_planning/reservations?orderId|productId` — items + history. `POST` actions: `reserve` (set total, refused beyond free with the holders named), `clear`, `move` (reason required), `reserve_needed` (fill each order up to its need from what is free, earliest delivery first).
- `GET/POST/PUT/DELETE /api/dermat_planning/plans` (optimistic lock on PUT/DELETE).

## Integration

- Store issue (`dermat_store`) checks free stock excluding other orders' reservations and names the holders; consumes the order's reservation.
- Order detail returns `reservations`; the Planning stage panel lists them with "Plan and reserve".
- Product stock card: in RM/PM store, reserved for orders, free, list per order with since date.
- Order cancel / completion releases reservations (logged).
- Core `/backend/wms/reservations` route removed from the app.

## Screens

- Planning → Planning board `/backend/planning` (`?orders=id,id` preselects).
- Planning → Reserved stock `/backend/planning/reservations`.
- Planning → Material planning (stage queue) moved to position 3.

## Tests

`planning_test.py` 29/29; `store_flow_test.py` 34/34; `order_flow_test.py` 56/56; QC 10/10; BOM 33/33; detail 10/10.

## Changelog

- 2026-09-26: Created and built.
