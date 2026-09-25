# Dermat India — Order-to-Dispatch Stage Engine

Status: Draft · Owner: Wantace · Date: 2026-09-25

## 1. Why

Dermat India (cosmetics contract manufacturer) is moving off Procuzy. Procuzy is the *data* reference
(what is tracked), not the UX to copy — the client left it because the workflow was scattered.
Today's app has the pieces but not the flow:

- Order stages are a hardcoded list in `transitionOrderStage.ts`; the order detail page does not show
  them at all (it still carries the generic Open Mercato status dropdown).
- Production uses the wrong stages (`bulk / semi_finished / finished`), stores the product as free
  text (no id/code → not searchable by product code) and is not linked to the order flow.
- Raw/packing materials live twice: `dermat_rm_master` / `dermat_pm_master` **and** catalog products
  created from the 5-tab inventory page (12 RM + 8 PM already duplicated).
- The order "stock check" queries tables that do not exist (`dermat_bom_formulations`), so it has
  never run. No stores, no stock transfers, no reservation.
- Leftover Open Mercato modules/pages are hidden (`navHidden`) instead of removed.

## 2. How the business works (from transcripts, client diagram, Procuzy screens)

Sequence: **R&D (new formulations only) → BOM → Planning → Production → QC/QA → Dispatch.**
Sales orders only ever *select* existing finished goods; no manufacturing order is created by hand —
production starts from the approved BOM once planning is done.

Production, exactly as the client drew it (`01_dermat_india_3_stage_production_flow_diagram.png`):

| Stage | Unit | Sub-stages |
|---|---|---|
| Manufacturing | KG / ml | 1 Requirement providing to Store · 2 Manufacturing · 3 QC Testing |
| Filling | bottles / gm / ml | 1 Bottle requirement providing · 2 Filling · 3 QC Testing |
| Packing | pieces | 1 Sample creation of finished good · 2 QC Testing · 3 All packaging → Finished Goods |

- **QC** = lab testing at each production step: parameter table *Parameter · Class · Specification ·
  Observation · Remark* → Pass/Fail (Procuzy QC screen).
- **QA** = final approval gate before billing/dispatch ("pending for QA").
- **Reserved stock** (Procuzy MRP screen): planner *manually* reserves (Reserve Stock), can Clear
  Reservation, and Send for Production issues the reserved material. Reservations roll up across
  orders sharing a material. Reserved stock is not debited from on-hand.
- **Stores**: RM Store, PM Store, Production, FG Store; material moves by numbered Stock Transfer
  (`DER/ST/...`, Issued → Received).

## 3. Two ways of working, one set of data

1. **Single operator** — from the order page, open the current stage's form in a right-side panel,
   fill every required field, complete → the order moves to the next stage.
2. **Department-wise** — every stage group has its own page: a queue of all orders/batches waiting at
   that stage. The department opens the job there, fills the same form, completes it.

Rules: a stage's data always shows on its own page no matter where it was entered; a stage cannot be
completed until required fields are filled; completing sends the work to the next stage's queue and
the order page shows the new stage name; revert sends it back with a mandatory reason; each action is
permission-gated.

## 4. Design

### 4.1 Stage engine (new module `dermat_workflow`)

- `dermat_stage_definitions` — admin-editable, seeded from §2. Columns: `code`, `name`,
  `subject_type` (`order` | `batch`), `parent_code` (sub-stages), `sequence`, `unit`, `department_id`,
  `kind` (`form` | `material_planning` | `stock_issue` | `production_output` | `qc_test` | `approval`),
  `is_optional`, `is_active`.
- `dermat_stage_runs` — one row per subject per stage: `subject_type`, `subject_id`, `order_id`,
  `stage_code`, `status` (`waiting` | `in_progress` | `completed` | `reverted` | `skipped`),
  `started_at/by`, `completed_at/by`, `revert_reason`, `data` (jsonb for kind-specific payload).
- Stage-specific **simple fields** are custom fields on `dermat_workflow:stage_run`, grouped by a
  fieldset per stage code → admins add/hide/require fields through the existing "Manage fields"
  dialog; nothing hardcoded. Structured stages (`kind` ≠ `form`) use a dedicated component.
- Commands: `stage.start`, `stage.complete` (validates required fields + kind rules, then opens the
  next run), `stage.revert` (reason required), `stage.skip` (optional stages only). The order's
  existing `order_stage` custom field is kept as a projection for list/Kanban compatibility.
- Order-level stages: New → Advance Payment → Verified → R&D/Sample (optional) → Artwork & Packaging
  → Material Planning → *Production (per batch)* → QA Approval → Billing → Ready to Dispatch →
  Dispatched. The order enters Production when its batches are created and leaves it when every
  batch has finished Packing.

### 4.2 One item master (fixes duplicate RM/PM store)

- `catalog_products` is the single master for RM, PM, Bulk, FG and R&D (`product_category_group`).
- Data migration: every `dermat_rm_master` / `dermat_pm_master` row is matched to an existing catalog
  product by name, else created; code/INCI/brand/supplier/physical state/unit carried over.
- `catalog_product_id` added to `dermat_bom_lines` and `dermat_purchase_order_lines`, backfilled; the
  old `raw_material_id` / `packaging_material_id` columns stay (read-only) for one release.
- `dermat_rm_master` / `dermat_pm_master` modules are removed from the app; RM/PM list pages are the
  catalog category pages that already exist.

### 4.3 Stores, stock, transfers, reservation (new module `dermat_inventory`)

- Stores: dictionary `dermat_inventory.store` (seed RM Store, PM Store, Production, FG Store).
- `dermat_stock_balances` (product × store: on_hand, reserved) and append-only
  `dermat_stock_movements` (receipt, issue, transfer, production output, adjustment; reference to the
  source document). Opening balances migrated from `dermat_rm_master.stock` / `dermat_pm_master.stock`.
- `dermat_stock_transfers` + lines, numbered `DER/ST/<FY>/<n>`, status Draft → Issued → Received.
- `dermat_stock_reservations` (order, product, store, qty, status active/consumed/cleared).
- Material Planning stage (order-level) explodes the order's BOMs and shows, per material: Required,
  Available, Reserved (%), Pending from Vendor (open PO lines), Pending from Production, Safety
  Stock, To Be Ordered, Vendor — with Reserve Stock, Clear Reservation, + Purchase Order and Send for
  Production (creates the RM Store → Production transfer, consumes the reservation).
- GRN receipts from purchase orders post stock into the right store.

### 4.4 Production batches

- Add `catalog_product_id`, `product_code`, `order_line_id`, `bom_id` to `dermat_production_batches`
  (search by product name or code). Batch number auto-generated.
- Batch stages come from the stage engine (batch-subject definitions) instead of the fixed
  `bulk/semi_finished/finished` rows; existing `dermat_batch_stages` stays for history only (0 rows
  today).
- `production_output` kind records planned/actual output and wastage in the stage's unit; Packing's
  last sub-stage posts finished goods into FG Store.

### 4.5 QC

- `qc_test` kind stores the parameter table (`parameter, class, specification, observation,
  remark, pass`) in `dermat_qc_tests`, referenced from the stage run. Parameters come from the QC
  policy for the product/category (admin-editable). A failed QC blocks completion and offers revert.

### 4.6 UI

- **Order page (one-page flow):** header + progress rail of order stages; the production step expands
  to each batch's Manufacturing/Filling/Packing sub-stage ("Filling · 2/3"). "Complete <stage>" opens a
  right-side `Sheet` with that stage's form; revert action with reason. The generic status dropdown
  card is removed.
- **Stage queue pages** (one per department group: Planning, Store, Production, QC, QA, Dispatch):
  `DataTable` of runs waiting/in progress, search by order no., customer, product name/code; row opens
  the same `Sheet`. The Production page groups by Manufacturing/Filling/Packing tabs.
- **Linked detail pages:** product (BOM, orders, batches, stock by store, vendors & purchase history),
  vendor (materials supplied, PO history), RM (vendors, purchase history, where used).
- All dialogs in these flows become right-side `Sheet` panels.

### 4.7 Cleanup (done/ongoing)

- Removed from `modules.ts`: devices, content, api_docs, messages, ai_assistant, scheduler,
  inbox_ops, integrations, workflows. Unused pages of kept modules are nulled routes, not hidden.
- Delete dead code: orphaned `CreateProductPanel`, broken order stock-check, empty unused
  `dermat_customers` table, the order page status dropdown.

## 5. Phasing

1. Cleanup — **done** (modules/routes removed, generate + typecheck clean).
2. Item master unification + data migration.
3. `dermat_inventory`: stores, balances, movements, transfers, reservations.
4. `dermat_workflow`: definitions (seeded), runs, commands, stage `Sheet` + form kinds.
5. Production batches on the engine; QC parameter tests.
6. Order page rebuild + stage queue pages.
7. Linked detail pages; dialog → Sheet conversions.

## 6. Migration & Backward Compatibility

- App-local modules only; no core contract changes. `order_stage` custom field kept as projection.
- Old RM/PM id columns kept one release; old tables kept (read-only) until the migration is verified.
- Migrations are written per module; applying them (`yarn db:migrate`) needs owner approval.

## 7. Integration coverage

- `POST /api/dermat_workflow/stage-runs/complete` — required-field validation, next stage opened,
  revert with reason.
- Material planning: reserve → clear → send for production (transfer created, reservation consumed,
  balances correct).
- Stock transfer Issued → Received moves balances between stores.
- Production batch: search by product code; Packing completion posts FG stock.
- UI: complete a stage from the order page Sheet and see it leave/enter the right queue page.

## Changelog

- 2026-09-25 — Initial draft from transcripts, client production diagram and Procuzy references.
