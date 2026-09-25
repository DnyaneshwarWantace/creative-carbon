# Dermat BOM (formula + pack BOM)

## TLDR

New module `dermat_boms`. A BOM belongs to one product from the product master:

- **Bulk / R&D BOM (formula)** — lines are Raw Materials (or another Bulk as a sub-formula) with **RM %**. The percentages must total 100 before approval. Quantity = RM % × batch size ÷ 100 (default batch 100 kg).
- **Finished Good BOM (pack BOM)** — lines are Bulk (kg per piece, e.g. 0.030 kg for a 30 g tube) and Packing Material (pcs per piece). A kit (cream + gel) is simply several Bulk lines. Quantity = qty per piece × batch pieces.

The BOM is edited as one document (header + all lines, saved together), Draft → Approved. An approved BOM is locked; "New version" copies it into a Draft with version + 1, and approving that draft marks the older one Superseded. One approved BOM per product at a time.

## Sources

- Transcript `Standard_recording_11`: BOM for FG only, simplify; remove wastage, extra quantity, product code, quality grade; multi-BOM (cream + gel + PM under one product).
- Transcript `Dermat India 4`: BOM code auto (hidden), formula in % per 100 kg, sequence can be re-ordered, search materials by code (AP-293), creator name stamped automatically, PDF.
- Procuzy BOM screenshot: header "Quantity: 100 KGS"; columns Code, Material, RM %, Qty, On hand, Availability.
- Old Dermat BOM screen (branch `snapshot/pre-cleanup-2026-09-25`): layout inspiration only — header strip with code/version/status, summary tiles, inline entry table, tree view, print sheet. Wastage, Qty/Unit + RM % double entry, UOM picker per line and the Demand tab are dropped.

## Data model

`dermat_bom_headers`: id, organization_id, tenant_id, code (auto `BOM-00001`, per org), product_id (catalog product, FK by id), product_kind snapshot, version int, status (`draft` | `approved` | `superseded`), batch_size numeric, batch_unit text, notes, created_by_name, approved_by_name, approved_at, created_at, updated_at, deleted_at.

`dermat_bom_items`: id, organization_id, tenant_id, bom_id, position, component_product_id, component_kind snapshot, percent numeric (formula lines), qty_per_unit numeric (pack lines), unit snapshot, remark, created_at, updated_at.

Old tables `dermat_boms` / `dermat_bom_lines` hold demo data from the deleted module and are not used.

## API (`/api/dermat_boms/...`)

- `GET boms` — list (`page`, `pageSize`, `kind` = formula|pack, `productId`, `status`, `search`), or one BOM with its lines when `id` is given (lines include component name, code, unit and on-hand stock).
- `POST boms` — create a Draft `{ productId, batchSize, notes, items[] }`.
- `PUT boms` — replace a Draft `{ id, batchSize, notes, items[] }`; optimistic lock on `updated_at`.
- `DELETE boms?id=` — Drafts only.
- `POST boms/approve` `{ id }` (feature `dermat_boms.approve`) and `POST boms/new-version` `{ id }` (feature `dermat_boms.manage`).
- `GET tree?bomId=&quantity=` — multi-level explosion (FG → Bulk → RM) using each Bulk's current BOM (approved, else draft), with a flat list of total needs, on hand and shortage. Loops are flagged and not expanded.
- `GET components?kinds=&search=` — material search by name or partial code, with on-hand.
- Mutation guard `dermat_boms.product-in-use` (`data/guards.ts`): deleting a catalog product that owns or is used in a draft/approved BOM returns 409 with the BOM names.

Features: `dermat_boms.view`, `dermat_boms.manage`, `dermat_boms.approve`.

## Screens

- **R&D → BOM** (`/backend/boms`): tabs Formulas (Bulk + R&D) / Pack BOMs (Finished Goods); columns Product, Code, Version, Status, Lines, Total %, Updated.
- **BOM page** (`/backend/boms/new?productId=` and `/backend/boms/<id>`): header strip (product, code, version, status, made/approved by), summary tiles (lines, total % or bulk per piece, batch size, short in stock), batch size, inline table (code, material, type, RM % or qty per piece, qty for batch, on hand with shortage highlight, remark, move up/down, remove), "Add material" search by name or code (`GET /api/dermat_boms/components`), notes; Save draft, Approve, Edit as new version, Delete draft.
- **Tree & needs** view on the BOM page: quantity to make, collapsible tree with per-parent value, needed qty, on hand, BOM links, "no formula yet" warning; total materials table with shortage.
- **Print / PDF**: A4 sheet (Dermat India header, product, BOM No., version, status, batch, lines with RM % / qty per piece and batch qty, totals, notes, Made by / Approved by name stamps, DRAFT watermark when not approved); printed or saved as PDF from the browser print dialog.
- Product edit page for Bulk / R&D / FG shows a "BOM" button (open existing or create).

## Later (with the order page)

Order-specific BOM copy and edits, planning explosion (FG → Bulk → RM), reservations.

## Status

Implemented 2026-09-25. Verified through the API (31/31, incl. tree 1000 pcs → 30 kg bulk → RM by %, totals, shortage, scaling, and delete protection): search by partial code and name, create, one-draft rule, % totals and batch quantities, approve blocked below 100 %, stale edit refused (409), duplicate / self / wrong-type lines refused, approved locked, new version + supersede, pack BOM per piece, list filters, delete draft. UI not yet clicked through in a browser.

Not done yet: order-specific BOM copies (with the order page).

## Changelog

- 2026-09-25: Spec created.
- 2026-09-25: Implemented API, screens, product-page link.
- 2026-09-25: Tree & needs view, print/PDF sheet, product-in-use delete guard; custom routes moved to runRouteMutationGuards.
