# Dermat R&D lab: request page, trial batches, stability and QC, formula to BOM

Status: in progress · Module: `dermat_rnd` · Builds on `dermat_boms` (formula BOMs) and `dermat_lists` (dropdowns)

## Why

The client asked to merge three R&D sheets into one: the batch request (from Sales), the R&D sheet (trial batches) and the stability / QC sheet (Dermat India 4, 12:54–13:50). Today `dermat_rnd` is a list of requests with sample rounds only. The client has not sent the three sheets after three weeks (asked again Dermat India 4, 23:14), so the module is built on the standard cosmetic lab format and every list, test parameter and stability condition lives in Masters → Dropdown Options so the sheets can be mapped in without code changes.

## Sources per field

| Field | Source |
|---|---|
| Request date (auto), brand, product name, ingredient list picked from the list, texture reference (name or an existing product), client instruction, fragrance, colour | Dermat India 4, 12:54–13:30 (batch request file) |
| "I took the batch, when I took it" → trial batch date and chemist | Dermat India 4, 13:20–13:30 |
| Description, texture, pH, stability, status pass / fail | Dermat India 4, 13:35–13:43 (stability and QC sheet) |
| R&D number, sequence continues from the client's number | Dermat India 4, 17:01–17:11 |
| Monthly count of R&D batches | Dermat India 4, 16:43–16:50 |
| Formula in % per 100 kg, RM by client code | BOM spec `2026-09-25-dermat-boms.md` |
| Stability conditions (45 °C, 40 °C / 75% RH, room temp, 4 °C, freeze-thaw, light), checkpoints (0, 7, 14, 30, 60, 90 days), viscosity, specific gravity, phase separation | Standard cosmetic stability practice; placeholders in Dropdown Options until the client's stability sheet arrives |

## Data

`dermat_rnd_requests` (existing) gains: `client_instruction`, `texture_reference`, `target_ph`, `claims`, `sample_qty`, `ingredient_refs` (jsonb: picked RM ids, codes, names), `approved_trial_id`, `bom_id`, `bom_product_id`.

`dermat_rnd_trials` (new), one row per lab batch of a request:

- `code` = `<request code>/T<n>`, `trial_no`, `status`: `draft` → `testing` → `passed` / `failed` → `approved` / `rejected`
- `batch_date`, `chemist_name`, `batch_size` + `batch_unit` (g default), `aim` (what changed from the previous trial), `procedure`
- `formula` jsonb: `[{ id, phase, productId, code, name, function, percent, isBalance, note }]` (`isBalance` = q.s. to 100, usually water)
- `observations` jsonb: `{ <parameter>: value }` for the parameters in list `rnd_test_parameters`, plus `result` (`pass` / `fail`) and `remarks`
- `stability` jsonb: `{ startDate, conditions[], checkpoints[], readings: [{ condition, day, date, values{}, result, remarks, by, at }] }`, `stability_status`: `not_started` / `running` / `passed` / `failed`
- `history` jsonb, `created_at`, `updated_at`, `deleted_at`

Lists added to `dermat_lists`: `rnd_product_types`, `rnd_formula_phases`, `rnd_ingredient_functions`, `rnd_test_parameters`, `rnd_stability_conditions`, `rnd_stability_checkpoints`, `rnd_stability_parameters`.

## Rules

- Formula percentages must total 100 (the balance line takes the remainder) before a trial can be submitted for testing.
- A trial can be approved only after its lab result is `pass`. Stability may still be running; the approval records the stability status at that moment.
- Approving a trial approves the request formula; the request keeps one approved trial. Approving another trial replaces it and logs it.
- "Make BOM" needs an approved trial and a Bulk or R&D product. Every formula line must be linked to a product in the master. It creates a draft formula BOM (batch 100 kg, line % = trial %) through the same code as the BOM page, then links the BOM to the request.
- Samples sent to the client name the trial they came from.
- Only `dermat_rnd.manage` (R&D) edits trials. Sales (`dermat_rnd.request`) reads trials and records client feedback.

## Screens

- `/backend/rnd/requests` list (compact grid, row opens the request)
- `/backend/rnd/requests/<id>` request page: header, status, tabs **Request**, **Trials**, **Stability**, **Samples**, **Activity**
- Trials tab: list of trials on the left, the selected trial on the right with **Formula**, **Lab results**, **Decision**
- Stability tab: conditions × checkpoints grid per trial; a cell opens the reading form
- `/backend/rnd/report` monthly report: trials made, passed, approved, by chemist

## API

- `GET/POST/PUT /api/dermat_rnd/requests` (existing, new fields)
- `GET /api/dermat_rnd/trials?requestId=`, `POST` (new trial, optional `copyFrom`), `PUT` (draft fields and formula)
- `POST /api/dermat_rnd/trials/action`: `submit`, `record_result`, `start_stability`, `record_reading`, `finish_stability`, `approve`, `reject`, `reopen`, `make_bom`
- `GET /api/dermat_rnd/report?month=YYYY-MM`

## Integration coverage

- Raise request → add trial → formula totals 100 → submit → record pass → approve → make BOM → BOM draft exists with the same lines
- Stability: start → record reading at a checkpoint → finish passed
- Sales login cannot edit a trial (403)

## Changelog

- 2026-10-06: first version
