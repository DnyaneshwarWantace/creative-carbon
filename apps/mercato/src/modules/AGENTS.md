# Dermat India ERP — Rules for Agents

This app is **Dermat India's ERP** (cosmetics contract manufacturer) built on Open Mercato. Read this before touching any module. It overrides generic Open Mercato habits.

## Always

- Build every Dermat screen, API and seed inside a `dermat_*` module in this folder. Open Mercato core (`packages/core`, `packages/ui`) is the framework, not the product.
- Reuse core **data and APIs** (catalog products, units, `wms` stock, sales documents, customers) instead of inventing new tables. Build the **screens** yourself in the Dermat module.
- Trace every field to a client source: their Excel sheets, their paper order form, the Procuzy screenshots in `Downloads/Wantace-projects/dermat-reference-images/`, or the meeting transcripts. Write the source in the spec. No invented fields.
- Keep forms short and per item type: an RM user sees RM fields only. Prefer plain text boxes; use a dropdown only when the value must come from a list. Name things the way Dermat staff do (Stock, Batches, Stores, Raw Materials — never "WMS", "zone", "variant").
- Read the current rebuild spec first: `.ai/specs/2026-09-25-dermat-product-unit-stock-foundation.md`.

## Never

- Never edit, extend or "customise" an Open Mercato core screen for Dermat (for example `packages/core/src/modules/catalog/backend/catalog/products/create/page.tsx`). The previous build did this and it had to be deleted. Replace the route instead (see below).
- Never assume a core screen you find in `packages/core` is what the client uses. Check the route table below.
- Never add a second product, stock or unit table. There is exactly one product master (catalog products) and one stock system (`wms`).
- Never leave a core page reachable just by hiding it from the sidebar. Replace it or remove the route (`null`) in `apps/mercato/src/modules.ts`.
- Never bring back the deleted modules (`dermat_rm_master`, `dermat_pm_master`, `dermat_bom` (replaced by `dermat_boms`), `dermat_purchase_orders`, `dermat_qc`, `dermat_sampling`, `dermat_production`, `dermat_sales_flow`, `dermat_workflow`, core `manufacturing`, core `purchasing`). The last state before the cleanup is on branch `snapshot/pre-cleanup-2026-09-25` for reference only.

## Route table: what the client actually sees

| Area | Client-facing screen | Module | Core screen status |
|---|---|---|---|
| Products (RM, PM, Bulk, FG, R&D) | `/backend/products` (tabs), `/backend/products/new/<type>`, `/backend/products/<id>` | `dermat_products` | `/backend/catalog/products*` removed; `/backend/catalog/products/[id]` loads the Dermat edit page |
| Product categories | `/backend/catalog/categories` (from "Manage categories" on Products) | core catalog | kept, not in sidebar |
| Customers | `/backend/customers/companies` (relabelled "Customer", Sales group) | core customers + `dermat_customers` fields | people, deals, pipelines removed |
| Stock | Store → Stock, Batches, Stock Ledger; Planning → Reservations; Masters → Stores | core `wms` (relabelled) | warehouses, zones, WMS config removed |
| Departments, Vendors | Masters / Purchase | `dermat_departments`, `dermat_vendors` | — |
| BOM (bulk formulas in RM %, FG pack BOMs per piece) | R&D → BOM `/backend/boms`, `/backend/boms/new?productId=`, `/backend/boms/<id>`; "BOM" button on Bulk/R&D/FG product pages | `dermat_boms` (spec `.ai/specs/2026-09-25-dermat-boms.md`) | — (old `dermat_boms`/`dermat_bom_lines` tables are dead demo data) |
| Orders (one-page order + 11 stages, stage work pages per department) | Sales → Orders `/backend/orders`, `/backend/orders/new` (`?copyFrom=` repeat), `/backend/orders/<id>`; department groups → `/backend/work/<stage>` | `dermat_orders` (spec `.ai/specs/2026-09-25-dermat-orders.md`) | core sales documents not used |
| Planning reservations, Purchase / GRN, inward QC, production batches | not rebuilt yet — plug into the order stages (planning, manufacturing…) | — | build as new `dermat_*` modules |

Every route override lives in `apps/mercato/src/modules.ts` under the `dermat_customers` entry. Add new ones there.

## Data model decisions (do not re-decide)

- **Product** = `catalog_products` row. Type = top-level category (Raw Material, Packing Material, Bulk, Finished Goods, R&D), stored in `custom_fieldset_code` (`raw_material`, `packing_material`, `bulk`, `finished_goods`, `rnd`). Type-specific fields are custom fields with that fieldset (`dermat_products/ce.ts`).
- **Codes**: `sku` is auto-generated. The client's own code (AP-070, EP-181, FC-005, CP-001…) is custom field `item_code` (shown as "Internal Reference ID" on Finished Goods) and is never generated. Search everywhere goes through `dermat_products/lib/productSearch.ts`: internal ID with spaces/dashes ignored ("AP 293" = "AP-293"), name, or SKU.
- **One ID through every stage**: a Finished Good's packing items (Carton, Label, Tube…) are created from the FG form ("Packing for this product", list `packing_item_type` in Dropdown Options) as packing materials named `<Type> - <FG name>` with SKU `<FG sku>-<TYPE>` and hidden fields `parent_product_id` / `packing_item_type` — never a new SKU number (Dermat India 4, 6:36–7:38). Renaming the FG renames them.
- **BOM number** is internal only — never show it (Dermat India 4, 6:14–6:27).
- **Units**: one unit per product (`default_unit`), picked from the `unit` dropdown list. No unit-conversion table — the client rejected it as too complex. Each type offers only its units (RM/Bulk/R&D: kg, g, l, ml; PM/FG: nos, pc) — see `dermat_products/lib/kindConfig.ts`.
- **Dropdowns**: every dropdown list lives in Masters → Dropdown Options (core dictionaries) so the client edits them without a developer. Add new lists there, never hardcode option arrays in a form.
- **Stock**: `wms` — one warehouse "Dermat India", stores `RM-STORE`, `PM-STORE`, `PRODUCTION`, `FG-STORE`. Min floor qty = inventory profile `reorder_point`. Pending QC = lot status `quarantine`.
- **Tax**: GST rates `gst-0/5/12/18/28` (18% default).

- **BOM**: one document per product version (`dermat_bom_headers` + `dermat_bom_items`), saved whole. Draft → Approved (locked) → Superseded when a newer version is approved; one draft per product. Formula lines store RM % (must total 100), pack lines store qty per piece. Components are catalog products (no copies).
- **Custom write routes**: use `runRouteMutationGuards` plus `enforceCommandOptimisticLock` (see `dermat_boms/lib/guard.ts`). `validateCrudMutationGuard` is deprecated and does not enforce optimistic locking.

- **Orders**: `dermat_orders` owns orders, lines, stages and history. Stage list, sub-steps and fields live in `dermat_orders/lib/stages.ts`; the client's order-form specs in `lib/specs.ts`. Customer names are encrypted — always read them through `findWithDecryption` (`lib/server.ts#loadCustomers`), never copy them into Dermat tables. A stage is completed only through `POST /api/dermat_orders/orders/stage` (same call from the order page and the stage work pages).

## Seeding an existing tenant

```bash
cd apps/mercato
corepack yarn mercato entities install --tenant <tenantId>
corepack yarn mercato dermat_products seed --tenant <tenantId> --org <organizationId>
```

Product fields are also managed by the client from the product form ("Customize fields" panel: hide/show, reuse a field from another type, create Text / Number / list fields — list options go to Dropdown Options). Re-running `entities install` resets the fields declared in `dermat_products/ce.ts` to their coded types, which undoes any "add to another type" the client did for those keys — run it only when you add or change a field in `ce.ts`, and re-apply client changes afterwards. Client-created fields are not touched.

After enabling or disabling a core module, rebuild core (`cd packages/core && corepack yarn build`) so its compiled entity ids match.
