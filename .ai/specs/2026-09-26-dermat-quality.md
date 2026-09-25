# Dermat QC — quality rules and quality checks

## TLDR

New module `dermat_quality`. QC is the QC department's own work, not a tick by production.

- **QC rules** (Masters for QC): one rule per operation (Purchase receipt, Bulk after manufacturing, After filling, Final after packing), optionally per product. A rule lists parameters (Parameter · Class · Specification · Test = chemical or micro) and says whether the **chemical** test and the **micro** test are required. A rule can be switched off (the client skips QC after filling by default).
- **QC checks**: created automatically when an order reaches Manufacturing, Filling or Packing (one per product line), from the matching rule. QC enters an observation and remark per parameter, then passes or fails the chemical part and the micro part separately, with their name and time stamped. The check passes only when every required part passes.
- **Gate**: the order stage (Manufacturing / Filling / Packing) cannot be marked done until its QC checks pass. A failed check stays failed until QC starts a re-test.

## Sources

- Standard recording 0:38–2:04: "test is done in two phases… one is quality, the second part is micro… departments are both different… one approval for this, one approval for that… it should be optional, but confirmed according to what is set."
- Standard recording 36:30–37:29: bulk goes to QC for approval before filling; QC after filling skipped; final testing after packing.
- Procuzy Inward Quality Rule list (QC Rule # `DER/QR/2425/436`, Title, Operations = Purchase Receipt, Control per = Batch, Verification = Pass Fail, Frequency = All, Assignees, Products), rule form (Title, Control per, Operations, Products, QC verification type, validity, frequency, default assignees, notify when rejected), parameter table (Parameter, Class, Specification, Observation, Remark; e.g. Appearance · Critical · "Hazy liquid, off-white to light grey", Viscosity 400–1000, Non-volatile content 10–11).
- Client QC inputs screenshot: Description, Identification, Average weight, Uniformity of weight (Text, Critical).

Default parameters are editable starting points until the client sends the quality rule file.

## Data

- `dermat_quality_rules`: code `DER/QR/<FY>/<nnn>`, title, operation (`purchase_receipt` | `bulk` | `filling` | `packing`), product_id (null = default for the operation), requires_chemical, requires_micro, is_active, parameters jsonb `[{ key, name, class, spec, test }]`, notes.
- `dermat_quality_checks`: code `DER/QC/<FY>/<nnnn>`, operation, product_id, order_id, order_no, stage_key, batch_no, rule_id, requires_chemical, requires_micro, chemical_status / micro_status (`pending` | `pass` | `fail` | `na`), status (`pending` | `passed` | `failed`), results jsonb `[{ key, name, class, spec, test, observation, remark }]`, chemical_by/at, micro_by/at, history jsonb.

## Screens (sidebar group QC)

- QC checks (`/backend/qc/checks`): Pending / Passed / Failed, filter by operation; check page with the parameter table and the two approvals.
- QC rules (`/backend/qc/rules`, `/backend/qc/rules/<id>`, `/backend/qc/rules/new`): list and rule page (parameters editable, chemical/micro required, on/off). New rules are product-specific; each operation keeps one default rule that cannot be deleted.
- Order stage page and panel show the stage's QC checks with links.

## Order integration

- Manufacturing opens → one bulk check per bulk in each line's approved pack BOM (falls back to the line product). Filling → filling rule (off by default). Packing → one check per finished good.
- Completing the stage is blocked until every check of that stage is `passed`. Re-test resets only the failed part and clears only its observations.
- Codes come from a max+1 query run inside the current transaction.

## Tests

- `order_flow_test.py` 56/56 (QC gate at manufacturing and packing, fail/re-test, stale edit 409) and `qc_rules_test.py` 10/10, both against the dev server with a temporary API key.

## Changelog

- 2026-09-26: Spec created.
- 2026-09-26: Pages, order-stage display, bulk-from-BOM checks, re-test fix, transaction-safe codes.
