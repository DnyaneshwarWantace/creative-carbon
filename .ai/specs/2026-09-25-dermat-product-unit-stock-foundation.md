# Dermat India — Product, Unit & Stock Foundation (Rebuild Step 1)

Status: in progress · Branch: `dermat-rebuild` · Supersedes the product/RM/PM parts of `2026-09-25-dermat-order-to-dispatch-stage-engine.md` (that module was deleted in the 2026-09-25 cleanup).

## TLDR

Dermat keeps **one product master for every item kind** (Raw Material, Packing Material, Bulk, Finished Good, R&D sample) on top of the upstream `catalog` module, with **Procuzy-style unit tables** (base unit + extra units with a ratio, UQC code, precision) and **stock in the upstream `wms` module** (lots, balances, reservations, movement ledger). No new Dermat tables for products or stock.

A new app module `dermat_products` owns the Dermat product screens (list with kind tabs, one create/edit form whose fields follow the chosen category) and the seed data (category tree, unit dictionary, per-kind custom fields, warehouse locations).

## Why

The previous build had three product masters (`catalog_products`, `dermat_rm_master`, `dermat_pm_master`), free-text units with no conversions, and stock as a single number. BOM, planning, purchase and production all depend on products, units and stock, so this foundation comes first.

Sources: client transcripts (Recording 11, Dermat India 3/4), client Excel sheets (RM master, fragrance sheet), Procuzy product screens and the 2026-09-24 screen recording (unit tables, stock tiles, "Other Details" fields). Field usage audit: Procuzy product fields are mostly empty in practice; the Excel sheets hold the real master data.

## Decisions

1. **Products = upstream `catalog_products`.** Every item kind is a catalog product with one default variant. `sku` is auto-generated (existing auto-SKU prefix setting). The client's own code (`AP-070`, `EP-181`, `FC-005`, `CP-001`, `BR-016`…) is a separate field `item_code`, searchable, never generated.
2. **Kind = top-level category.** Categories use the upstream catalog category tree. Top level: Raw Material · Packing Material · Bulk · Finished Goods · R&D. Sub-categories under them (Actives, Excipients, Fragrance, Colour… / Bottles, Caps, Pumps, Droppers, Jars, Tubes, Labels, Cartons, Leaflets, Spatula, Tray, Shipper, Bottle Set). The kind is stored in `custom_fieldset_code` (`raw_material`, `packing_material`, `bulk`, `finished_good`, `rnd`) so custom fields follow it.
3. **Units = upstream catalog UOM.** Base unit = `default_unit`; extra units = `catalog_product_unit_conversions` (`unit_code`, `to_base_factor`); precision = `uom_rounding_scale`. Purchase unit is stored as custom field `purchase_uom` (must be one of the product's units). Units come from the `unit` dictionary; Dermat seeds its unit set and deactivates units it does not use. UQC lives on the dictionary entry.
4. **Stock = upstream `wms`.** Re-enable `wms`. Inventory profile per product carries min floor qty (`reorder_point`), strategy (FIFO/FEFO), lot/expiry tracking. Stock locations: RM Store, PM Store, Production, FG Store. "Pending QC" = lot status `quarantine`; "Rejected" = `hold`.
5. **No invented fields.** Every custom field below traces to the client's Excel sheets, Procuzy, the order form or a transcript. Fields Procuzy has but the client never fills (barcode, Tally name, date formats, prices on RM/PM) are not shown.

## Unit set (dictionary `unit`)

| Code | Label | UQC | Kind |
|---|---|---|---|
| g | Grams | GMS | weight |
| kg | Kilo Grams | KGS | weight |
| ton | Tonnes | TON | weight |
| qtl | Quintals | QTL | weight |
| ml | Milliliter | MLT | volume |
| l | Liter | LTR | volume |
| nos | Numbers | NOS | count |
| pc | Pieces | PCS | count |
| dozen | Dozen | DOZ | count |
| pair | Pairs | PRS | count |
| box | Box | BOX | count |
| roll | Roll | ROL | count |
| set | Set | SET | count |

Other upstream units (gb, license, seat, hour, km…) are deactivated for the Dermat tenant.

### Unit templates (pre-filled when a product is created; editable)

| Kind | Base unit | Extra units (ratio to base) |
|---|---|---|
| Raw Material, Bulk, R&D | kg | g 0.001 · ton 1000 · qtl 100 |
| Packing Material | nos | dozen 12 · pair 2 (labels add pc 1) |
| Finished Goods | nos | dozen 12 |

Bulk and FG may add `nos` with a kg ratio (Procuzy: Hydramoist bulk `NOS = 0.075 kg`) — this is the pieces↔kg bridge planning uses.

## Fields per kind

Common (every kind, upstream columns): Name, Category, Item code (`item_code`), Base unit, Purchase unit, GST % (tax rate), HSN code, Shelf life (months), Min floor qty, Description.

| Field (custom field key) | RM | PM | Bulk | FG | R&D | Source |
|---|---|---|---|---|---|---|
| `inci_name` INCI name | ● | | | | | RM sheet col B |
| `make_brand` Make / brand | ● | ● | | | | RM sheet |
| `supplier` Supplier | ● | ● | | | | RM & fragrance sheets |
| `benefit` Benefit / function | ● | | | | | RM sheet |
| `alternative` Alternative material | ● | | | | | RM sheet |
| `solubility` Solubility (os / ws) | ● | | | | | Fragrance sheet |
| `old_code` Old code | ● | ● | | | | Fragrance sheet "CODE NO" |
| `physical_state` Physical state | ● | | ● | | | Recording 11 · 65:03 |
| `grn_excess_percent` % excess GRN | ● | ● | | | | Procuzy product form |
| `printed` Printed / non-printed | | ● | | | | Dermat 4 · 14:59 |
| `capacity` Size / capacity | | ● | | | | Client PM names ("30 ml", "20/410") |
| `cap_colour`, `body_colour` | | ● | | | | Client order form (tube/bottle spec) |
| `shape` Round / oval | | ● | | | | Client order form |
| `finish` Matt / glossy | | ● | | | | Client order form |
| `decoration` Leafing / UV / foiling | | ● | | | | Client order form |
| `linked_product_id` Linked FG (printed PM) | | ● | | | | Dermat 4 · 6:36 |
| `density` g per ml | | | ● | ● | | Needed for ml↔kg (Recording 11 · 42:19) |
| `customer_id`, `brand_name` | | ● | | ● | ● | Client order form (Company, Brand) |
| `pack_size`, `pack_unit` | | | | ● | | Client order form |
| `mrp` MRP | | | | ● | | Client order form |
| `fragrance`, `colour` | | | | ● | | Procuzy "Other Details" |
| `rd_number` R&D no. | | | ● | | ● | Dermat 4 · 12:54 |

Stock, reserved and available are never typed — they come from `wms`.

## Screens (`dermat_products`)

- **Products list** (`/backend/catalog/products`, overridden): tabs All · Raw Material · Packing Material · Bulk · Finished Goods · R&D; columns SKU, Item code, Name (+ INCI/alias line), Category, Stock (in base unit), Min floor, Status; search by SKU, item code or name.
- **Create / edit** (`/backend/catalog/products/create`, `/backend/catalog/products/[id]`, overridden): Category first → form shows common fields + that kind's fields + the unit table pre-filled from the kind's template. Saves catalog product + default variant + unit conversions + custom fields + wms inventory profile in one flow.
- **Product detail**: stock tiles (Available · Pending QC · Rejected · Reserved · by location) from `wms`, tabs for Units, Stock ledger, (later) BOMs, Vendor prices, Activity.
- **Categories** page re-enabled under Masters.

## Phases

1. **Seed & wiring** — enable `wms`; seed unit dictionary entries, category tree, custom fields per fieldset, warehouse "Dermat India" with locations RM Store / PM Store / Production / FG Store; re-enable categories page.
2. **Product form** — one create/edit form with category-first behaviour and unit table.
3. **Product list + detail** — kind tabs, search by item code, stock tiles from `wms`.
4. **Import** — Excel import for the RM sheet and fragrance sheet (maps to `item_code`, `inci_name`, `supplier`, `make_brand`, `benefit`, `alternative`, `solubility`, `old_code`, stock).

## Out of scope (later steps)

Auto-created printed PM for an FG (step 4, BOM), GRN/QC (step 3), BOM (step 4), orders (step 5).

## Open questions for the client

- Packing master code list (prefix per PM type) — confirm CP-/BR-/BS-/PS-/DR- and the rest.
- Whether FG MRP and pack size stay per product or per order line.

## Revision 2026-09-25 (client feedback)

The client rejected the Procuzy-style unit table and long forms. Current design:

- One unit per product, chosen from the `unit` dropdown list (kg, g, l, ml, nos, pc). No conversion table, no purchase unit, no FIFO/FEFO or batch settings on the form (defaults: FIFO, batch tracking on).
- Dropdown lists are managed in Masters → Dropdown Options (core dictionaries).
- Fields per type follow the client's Excel sheets only: RM = Name, Code, INCI, Make/Brand, Supplier, Benefit, Alternative; PM = Name, Code, Capacity, Cap colour, Body colour, Supplier, Make/Brand; Bulk = Name, Code, R&D No.; FG = Name, Code, Brand, Pack size, MRP; R&D = Name, Code, R&D No., Brand. Every type also has Unit, Minimum stock, GST and HSN.
- One Products page with a tab per type; "Add" opens that type's form with the type preset. Layout takes its style from the earlier Dermat create page (type strip, numbered cards).
- The "Fields per kind" and "Unit set / templates" tables above are superseded by this revision.

## Changelog

- 2026-09-25: Spec created after cleanup of the previous Dermat modules.
- 2026-09-25: Simplified per client feedback (see Revision section).
