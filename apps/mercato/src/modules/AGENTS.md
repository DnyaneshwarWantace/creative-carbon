# Creative Carbon Composites ERP — Rules for Agents

This app is the ERP for **Creative Carbon Composites Pvt. Ltd.** (CCCPL, Kanera, Kheda, Gujarat): phenolic resin, impregnated cloth / paper (B-stage), compression-moulded laminates, tubes, rods and moulded components. It is built on Open Mercato and started as a copy of the Dermat India ERP; the cosmetics parts were removed on 7 Oct 2026. Read this before touching any module.

The plan, stage by stage, is `.ai/docs/client-facing/creative-carbon-plan.html` (published as an artifact). The client brief is `Downloads/creative-carbon/Wantace_CreativeCarbon_DevBrief.md`; register photos and audit recordings are in `Downloads/creative-carbon/Archive 3/`.

## Always

- Build every screen, API and seed inside a `cc_*` module in this folder. Open Mercato core (`packages/core`, `packages/ui`) is the framework, not the product.
- Make each plant screen look like the paper register it replaces: same columns, same order, same words (Chindi, Kushan, Daylight, Die No., B-stage, O.B.). Trace every field to a register photo, the brief or the audit recording.
- Weights are kg with three decimals everywhere; piece counts only on moulded parts. Never use floats for weight or money.
- Fields printed on the forms but left blank in practice are optional and switched off by default.
- Every register gets an Excel template and upload (the client will hire a data-entry person for the first months).
- Reuse core **data and APIs** (catalog products, `wms` stock, customers, dictionaries) instead of inventing new tables. Build the **screens** yourself in a `cc_*` module.
- Every dropdown list lives in Masters → Dropdown Options (`cc_lists/lib/lists.ts`) so the client edits it without a developer.

## Never

- Never edit or "customise" an Open Mercato core screen. Replace the route in `apps/mercato/src/modules.ts` (under the `cc_customers` entry) or remove it (`null`).
- Never leave a core page reachable just by hiding it from the sidebar.
- Never add a second product, stock or unit table. One product master (catalog products), one stock system (`wms`).
- Never bring back the Dermat cosmetics modules (BOMs, material planning, chemical / micro QC, R&D sampling, artwork, store requests, bulk → filling → packing production). The full Dermat code is on local branch `snapshot/dermat-final-2026-10-07` for reference only.
- Never point this copy at Dermat's database or GitHub. It has no git remote on purpose.

## Modules

| Module | What it owns |
|---|---|
| `cc_orders` | One-page order with 7 stages (`lib/stages.ts`): Order booked → Advance / LC → Stock allocation → QC & test report → Packing & weighment → Invoice & documents → Despatch. Order book, stage pages `/backend/orders/<id>/stages/<key>`, department queues `/backend/work/<stage>`, stage settings `/backend/masters/stages`. Line details (grade, weave, sheet size, thickness, pieces, die no., packing, test standard) are in `lib/specs.ts`. A stage changes only through `POST /api/cc_orders/orders/stage`. |
| `cc_products` | Product screens on catalog products. Item types still the Dermat ones (RM / PM / Bulk / FG / R&D) until plan Stage 1 replaces them with Chemical, Reinforcement, Chindi, Resin, B-stage, Sheet / Tube / Rod, Moulded part, Bought-in / Consumable. |
| `cc_store` | Stock by store and lot, stock ledger, adjustments, transfers, reports (`wms` underneath). Stores still RM / PM / Production / FG until Stage 1. |
| `cc_purchase` | Indents, POs with approval, GRN. Received lots wait as "to check"; the GRN page passes or holds each line (`POST /api/cc_purchase/grns/decide`). |
| `cc_accounts` | Company details, number series (prefix `CCCPL/`), proformas, tax invoices, payments, dues, vendor bills, Tally export. |
| `cc_customers`, `cc_vendors` | Party pages on core customers, vendor master. |
| `cc_departments` | Department logins and the access screen (`/backend/masters/access`, areas in `lib/access.ts`). |
| `cc_dashboard` | Overview, my pending work, turnaround, morning email. |
| `cc_lists` | Dropdown options and units. |
| `cc_production` | Not built yet: the plant registers (resin, coating / B-stage, press, moulding, cutting, thickness, FG inspection, lab), the lot tree and the upload centre (plan Stages 2–8). |

## Data decisions (do not re-decide)

- **Production is not order-driven.** Raw material is bought by reorder level and sheets are pressed to stock. Orders only allocate finished lots; the order has no manufacturing stage.
- **Customer names are encrypted** — read them through `findWithDecryption` (`cc_orders/lib/server.ts#loadCustomers`), never copy them into `cc_*` tables.
- **Custom write routes** use `runRouteMutationGuards` plus `enforceCommandOptimisticLock`.
- **Number series** live in `cc_accounts/lib/numberSeries.ts` and are editable in Accounts → Number series.

## Seeding an existing tenant

```bash
cd apps/mercato
corepack yarn mercato entities install --tenant <tenantId>
corepack yarn mercato cc_products seed --tenant <tenantId> --org <organizationId>
```

After enabling or disabling a core module, rebuild core (`cd packages/core && corepack yarn build`) so its compiled entity ids match.
