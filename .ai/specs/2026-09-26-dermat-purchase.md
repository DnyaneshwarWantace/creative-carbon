# Dermat purchase: PO, approval, goods receiving (GRN), inward QC

## TLDR

Purchase raises a PO to a vendor (vendor picked by name / code / GST; rate, quantity, GST % per line; expected date; linked customer orders). The PO is approved before goods can be received. Goods are received against the PO on a GRN with the vendor batch no., mfg and expiry dates: stock goes into RM-STORE / PM-STORE as a new batch with status "quarantine" (under QC test) and an inward QC check is created per batch from the `purchase_receipt` QC rule. QC pass → batch "available" (usable); QC fail → batch "hold"; a rejected batch can be returned to the vendor (stock taken out, quantity open again on the PO). Only "available" batches count as usable stock for planning, reservations and store issue.

Module: `dermat_purchase`.

## Sources

- Standard recording 66:16–69:26: "until they approve the GRN it won't show in the stock"; PO with rate, GST name fill, delivery date; extras (transport, LR) removed; PO notification → approval; GRN against the PO shows complete; stock goes to QC; approved.
- Standard recording 47:13–47:32: two stocks, "under testing" and "approved"; QC fail → returned.
- Dermat India 4 · 7:25: carton / label short → purchase order from there (planning).
- Procuzy: Purchase Orders DER/PO/…, GRN register DER/GR/… (status, Purchase Order / Adhoc), Inward Quality Checks.

## Data

- `dermat_pos`: `DER/PO/<FY>/<nnnn>`, vendor id / name / GSTIN snapshot, po_date, expected_date, status draft | pending_approval | approved | partly_received | received | cancelled, notes, terms, order_refs, created/approved by, history.
- `dermat_po_lines`: product, unit, quantity, rate, gst_percent, received_qty.
- `dermat_grns`: `DER/GR/<FY>/<nnnn>`, po, vendor, grn_date, invoice no / date, status under_test | partly_approved | approved | rejected, history.
- `dermat_grn_lines`: po line, product, variant, store rm | pm, quantity, lot id / number, mfg / expiry, qc_check_id, qc_status pending | passed | failed | returned, returned_qty.

## Stock

- GRN: `wms.lots.create` (status quarantine; vendor batch no., made unique per material with the GRN code if needed) + `wms.inventory.receive` into the store location.
- QC decision (`dermat_quality` chemical / micro / retest routes) calls `applyInwardDecision` → `wms.lots.update` status available / hold / quarantine.
- Return to vendor: `wms.inventory.adjust` −qty on the batch; PO line received_qty reduced.
- `dermat_products/lib/stock.ts` exposes lot status; planning `storeStock`, store issue and store views count only `available` batches. Planning shows `underTest`, `onOrder` (pending / approved / partly received POs), `toOrder` = short − under test − on order.

## API

- `GET /api/dermat_purchase/vendors?q=|id=`
- `GET/POST/PUT /api/dermat_purchase/orders` (list views draft / pending_approval / open / received, `productId`, `vendorId`, `search`; detail with totals and GRNs); `POST …/orders/submit | approve | cancel` (optimistic lock).
- `GET/POST /api/dermat_purchase/grns`; `POST /api/dermat_purchase/grns/return`.
- `GET /api/dermat_products/search` accepts `ids=`.

## Screens

- Purchase → Purchase orders `/backend/purchase/orders`, `/new` (`?items=productId:qty,…&orders=orderId:orderNo,…` from the planning board), `/<id>`, `/<id>/edit`; printable PO.
- Purchase → Goods receiving `/backend/purchase/grns`, `/new?poId=`, `/<id>`.
- Planning board: "under test", "on PO", "buy" per material, "Raise PO for what to buy".
- Product page (RM / PM): Purchase orders card with "Raise PO".
- QC → QC checks shows inward checks with the GRN number.

## Tests

`purchase_test.py` 31/31; `full_chain_test.py` 19/19 (order → planning short → PO → approval → GRN → inward QC → reserve → store issue → manufacturing QC → filling → packing QC → QA → billing → dispatch; stock reconciles to zero); planning 29/29; store 34/34; order flow 56/56; QC 10/10; BOM 33/33; detail 10/10.

## Changelog

- 2026-09-26: Created and built.
