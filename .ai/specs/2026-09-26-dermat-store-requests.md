# Dermat store requests (production ↔ RM / PM store)

## TLDR

Production asks the RM or PM store for material from the order stage (Manufacturing: RM; Filling: bottles, tubes, caps; Packing: cartons, labels, sample kit). The store issues by batch, stock moves RM/PM STORE → PRODUCTION at once, and the order's reservation is used first. Production confirms receipt. The stage cannot be completed until every request of that stage is received. Completing the stage records the material as used (PRODUCTION stock reduced). Leftover can be returned to the store.

Module: `dermat_store` (`apps/mercato/src/modules/dermat_store`). Shared stock helpers: `dermat_products/lib/stock.ts`.

## Sources

- Dermat India 3 · 3:44–5:44: requisition from manufacturing to the store; the store gives it; production is the receiver; stock deducted automatically when sent; alert if not received.
- Dermat India 3 · 6:08–7:27: same flow for filling (bottles) and packing (sample kit).
- Procuzy screens: Material Requests (status + fulfilment Pending / Partially fulfilled) and Stock Transfers `RM STORE → PRODUCTION` (Issued · RECEIVED).
- No store "reject" step: the client did not ask for one.

## Statuses

| Status | Meaning | Stock |
|---|---|---|
| requested | nothing issued | none (reservation stays) |
| partly_issued | some lines or quantity still open | store − qty → PRODUCTION + qty |
| issued | everything issued, waiting for production | same |
| received | production confirmed | — |
| used | stage completed | PRODUCTION − remaining (adjust) |
| cancelled | only while nothing issued | — |

`awaitingReceipt` = any line issued > received (shown as "Sent · not received").

## Data

- `dermat_store_requests`: code `DER/MR/<FY>/<nnnn>`, order_id, order_no, stage_key, store (`rm`|`pm`), status, notes, requested_by_name, received_by_name/at, used_at, history jsonb.
- `dermat_store_request_lines`: product_id, variant_id, unit, required/issued/received/used/returned qty, issues jsonb `[{lotId, lotNumber, quantity, used, returned, movementId, by, at}]`.

## API

- `GET/POST /api/dermat_store/requests` (list: `view=to_issue|to_receive|done|all`, `store`, `orderId`, `productId`, `search`; detail `?id=` with lots in store and reservation for the order)
- `GET /api/dermat_store/requests/suggest?orderId&stageKey` (from approved BOMs, minus already asked)
- `POST …/issue` (feature `dermat_store.issue`), `…/receive`, `…/return`, `…/cancel` (feature `dermat_store.request`); optimistic lock on each.
- Stock moves use `wms.inventory.move` / `release` / `reserve` / `adjust` through the command bus.

## Order integration

- `storeBlocking` in the order engine: Manufacturing / Filling / Packing need ≥1 non-cancelled request, nothing in `requested`, nothing awaiting receipt. Checked before QC.
- After a successful complete of those stages, `consumeForStage` records use (batch no. from the Manufacturing stage).
- Order detail returns `store` per stage; the stage panel shows requests and "Ask the store".
- Removed manual steps `store_requirement` and `bottle_requirement`.

## Screens

- Store → Store requests `/backend/store/requests` (tiles To issue / Sent, not received / Done; RM / PM switch; search)
- `/backend/store/requests/<id>` (journey, banner, materials with batch picker and issue qty, return and cancel dialogs, history)
- `/backend/store/requests/new?orderId&stageKey` (pre-filled from the BOM)
- Production → Material from store `/backend/production/material`
- Product page: Store requests card for RM / PM.

## Tests

`store_flow_test.py` 34/34, `order_flow_test.py` 56/56 (now goes through the store), QC 10/10, BOM 33/33, detail 10/10.

## Changelog

- 2026-09-26: Created and built.
