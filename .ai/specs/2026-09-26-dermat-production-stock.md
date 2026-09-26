# Dermat production details and production stock

## TLDR

- Manufacturing records bulk source (make a new batch / use bulk already made), batch no., kg made or taken, mfg date, shift, vessel / machine, operator, start and end time (machine time shown), wastage kg (yield % against the BOM plan shown). Filling records units filled, rejected units, date, shift, filling machine, operator. Packing records packed pcs, date, shipper boxes, location.
- Production stock is real: completing Manufacturing (new batch) puts the bulk into PRODUCTION as a batch (lot = batch no., mfg date); Filling uses bulk by fill size × SG for the units filled; Packing puts finished goods into FG-STORE under the same batch no. with expiry = mfg date + the order's "Expiry month" (e.g. 24M); Dispatch takes them out (LR no. in the history).
- One bulk, several pack sizes (client: 100 kg bulk filled into 10 / 20 / 30 ml): another order's Manufacturing can "Use bulk already made": pick a QC-approved bulk batch in PRODUCTION with enough kg. That order skips its own store request and bulk QC (its pending bulk check is retired with a note); Filling then uses the shared batch.
- Materials / products without a stock record (older data) get one created on demand (variant + inventory profile) the first time stock moves (store request, GRN, production).

## Sources

- Dermat India 3 · 0:45–1:11: at each production step, shift data, machine running duration, operator name.
- Standard recording 28:00: which machine ran, in which shift, who ran it; 38:36–39:09: waste recorded, leftover wasted or back to stock.
- Standard recording 43:02–43:53: one 100 kg bulk bifurcated into 10 ml, 20 ml, 30 ml fillings in different quantities.

## Code

- `dermat_orders/lib/productionStock.ts`: `bulkPlan`, `availableBulk`, `existingBulkProblem`, `onProductionStageDone` (called by the stage route after completing manufacturing / filling / packing / dispatch).
- Engine: "use bulk already made" validates the batch and bypasses store and QC gates for Manufacturing; `retireStageChecks` in `dermat_quality`.
- `GET /api/dermat_orders/orders/bulk?orderId=`: planned bulk per line and reusable batches.
- Stage field type `time`; `ProductionPanel` on Manufacturing (planned kg, yield, machine time, batch picker) and Filling (bulk used, per piece).
- `dermat_store/lib/stockSetup.ts`: `ensureStockRecords`.

## Tests

`production_test.py` 14/14; all other suites re-run: chain 19, purchase 31, planning 29, store 34, orders 56, dashboard 12, QC 10, detail 10, BOM 33.

## Changelog

- 2026-09-26: Created and built.
