# Dermat overview dashboard and morning pending-work email

## TLDR

- Overview → Overview `/backend/overview`: open orders, orders with a stuck step (on hold or open ≥ 3 days), on hold, due in 7 days, past delivery date; open steps per stage (on hold part in red, oldest days; click → the stage work page); stuck the longest (with responsible person or whose side is holding); pending by person; waiting on a team (POs to approve, GRN batches in QC, store requests to issue, sent-not-received, QC pending, materials below minimum); materials below minimum (usable QC-approved stock ≤ the material's minimum level, with on-PO and in-QC; "Raise PO"); latest orders.
- Overview → My pending work `/backend/my-work`: open order steps assigned to me, late / stuck / on hold first; supervisors can switch to everyone.
- Morning email: `mercato dermat_dashboard send-digest --tenant <id> --org <id> [--base-url https://…] [--dry-run]` sends each person with assigned open steps their list (order, customer, step, department, days waiting, hold reason, link to the step).

Module: `dermat_dashboard` (no tables).

## Sources

- Dermat India 3 · 2:38–2:58: dashboard shows raw material out of stock, how many orders at which stage, "four orders stuck on artwork"; admin dashboard.
- Dermat India 4 · 15:36–16:14: whoever is responsible gets an email every morning with their list of pending steps; hold states show whose side.
- Standard recording 66:23: "I should know where it's pending and why it's pending."

## Morning email setup

Email goes through the platform `sendEmail` (Resend). Set `RESEND_API_KEY` and `EMAIL_FROM` (or `NOTIFICATIONS_EMAIL_FROM`) and schedule daily, e.g. cron `0 8 * * *`:
`cd <app> && yarn mercato dermat_dashboard send-digest --tenant <tenantId> --org <orgId> --base-url https://<host>`.
Without the key the command reports "NOT SENT … RESEND_API_KEY is not set" per person.

## API

- `GET /api/dermat_dashboard/overview` (feature `dermat_dashboard.view`)
- `GET /api/dermat_dashboard/my-work` (`dermat_dashboard.my_work`; empty when the caller has no user)
- `GET /api/dermat_dashboard/team-work` (`dermat_dashboard.everyone`)

## Tests

`dashboard_test.py` 12/12 (tiles, pipeline, stuck list with hold party and late flag, pending by person, below-minimum material with on-PO, PO approval queue, team work with the person, no personal work for an API key, morning email captured in test mode with order / step / days / links). All other suites re-run: chain 19, purchase 31, planning 29, store 34, orders 56, QC 10, BOM 33, detail 10.

## Changelog

- 2026-09-26: Created and built.
